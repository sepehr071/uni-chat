"""
Meetings API blueprint — upload, transcription/summary pipeline orchestration,
artifact retrieval, audio streaming, SSE status, regenerate, cancel,
spawn-conversation, save-to-knowledge, suggest-series.

All routes:
  - `@jwt_required()` (verify JWT)
  - `@active_user_required` (block banned users)
  - `@feature_required('meetings')` (404 when flag disabled)

Personal-scope v1: ownership is the only authorization gate. ``meeting_id`` is
a UUID4 string (NOT ObjectId); ``owner_id`` is an ObjectId.
"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request, send_from_directory, stream_with_context
from flask_jwt_extended import get_current_user, jwt_required

from app.models.conversation import ConversationModel
from app.models.knowledge_folder import KnowledgeFolderModel
from app.models.knowledge_item import KnowledgeItemModel
from app.models.meeting import MEETING_STATUS, MeetingModel
from app.models.meeting_summary import MeetingSummaryModel
from app.models.meeting_transcript import MeetingTranscriptModel
from app.models.message import MessageModel
from app.services import meeting_glossary, meeting_storage, meetings_pipeline, series_match
from app.services.meeting_storage import AudioTooLargeError
from app.services.meetings_service import MEETING_DISCUSSION_MODEL, build_seed_text
from app.utils.decorators import active_user_required
from app.utils.feature_required import feature_required
from app.utils.helpers import serialize_doc

logger = logging.getLogger(__name__)

meetings_bp = Blueprint('meetings', __name__)


# ---------------------------------------------------------------------------
# Constants — terminal statuses for SSE polling exit conditions.
# ---------------------------------------------------------------------------
_TERMINAL_STATUSES = {MEETING_STATUS['DONE'], MEETING_STATUS['FAILED']}
_IN_FLIGHT_STATUSES = {
    MEETING_STATUS['UPLOADED'],
    MEETING_STATUS['TRANSCRIBING'],
    MEETING_STATUS['SUMMARIZING'],
}
_POLL_INTERVAL_S = 1.0
_KEEPALIVE_INTERVAL_S = 15.0
_SSE_MAX_WALLCLOCK_S = 60 * 60  # safety: hang up after 1h on the SSE channel


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_meeting(doc: dict) -> dict:
    """Render a meeting doc as JSON-safe dict. ObjectId/datetime → str/iso."""
    return serialize_doc(doc)


def _serialize_summary(doc: dict) -> dict:
    return serialize_doc(doc)


def _serialize_transcript(doc: dict) -> dict:
    return serialize_doc(doc)


def _run_in_ctx(app, fn, *args) -> None:
    """Re-enter the Flask app context inside the background thread.

    Without this, PyMongo + ``current_app.config`` calls fail with
    "Working outside of application context" (CLAUDE.md known issue).
    """
    with app.app_context():
        try:
            fn(*args)
        except Exception:
            logger.exception("background thread crashed in %s", fn.__name__)


def _dispatch_pipeline(meeting_id: str) -> None:
    """Capture the live app object and spawn a daemon thread running the pipeline."""
    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_in_ctx,
        args=(app, meetings_pipeline.run_pipeline, meeting_id),
        daemon=True,
    )
    thread.start()


def _dispatch_regenerate(meeting_id: str) -> None:
    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_run_in_ctx,
        args=(app, meetings_pipeline.regenerate_summary, meeting_id),
        daemon=True,
    )
    thread.start()


def _sse_event(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"


# ---------------------------------------------------------------------------
# POST /upload — multipart, bypass MAX_CONTENT_LENGTH=16MB.
# ---------------------------------------------------------------------------

@meetings_bp.route('/upload', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def upload_meeting():
    """Multipart upload — bypass Flask's global 16MB cap.

    Approach: Flask 2.3+ supports per-route ``request.max_content_length``
    override. Set it to ``MEETING_MAX_AUDIO_BYTES`` BEFORE touching
    ``request.files`` (werkzeug's form parser checks the override).

    Fallback path: if the request has no ``file`` part (or werkzeug couldn't
    parse it past the override) we still validate ``request.content_length``
    against the meeting cap and bail with a clear error.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    max_bytes = int(current_app.config.get('MEETING_MAX_AUDIO_BYTES', 500 * 1024 * 1024))

    # Per-route override — Flask 2.3+ honors this in werkzeug's form parser.
    try:
        request.max_content_length = max_bytes
    except Exception:
        pass

    # Cheap content-length pre-check (multipart envelope is ~few KB extra; we
    # leave the strict per-chunk enforcement to ``save_audio_stream``).
    declared_length = request.content_length
    if declared_length is not None and declared_length > max_bytes + (16 * 1024 * 1024):
        return jsonify({
            'error': 'Audio file too large',
            'code': 'audio_too_large',
            'max_bytes': max_bytes,
        }), 413

    file_storage = request.files.get('file')
    if file_storage is None or not file_storage.filename:
        return jsonify({'error': "Missing 'file' multipart part"}), 400

    title = (request.form.get('title') or '').strip() or None
    series_id = (request.form.get('series_id') or '').strip() or None
    meeting_brief = (request.form.get('meeting_brief') or '').strip() or None

    raw_num_speakers = (request.form.get('num_speakers') or '').strip()
    num_speakers: Optional[int] = None
    if raw_num_speakers:
        try:
            ns = int(raw_num_speakers)
            num_speakers = ns if ns > 0 else None
        except ValueError:
            return jsonify({'error': 'num_speakers must be a positive integer'}), 400

    meeting_id = str(uuid.uuid4())

    try:
        absolute_path, _ext, written_bytes = meeting_storage.save_audio_file_storage(
            file_storage,
            meeting_id=meeting_id,
            user_id=user_id,
            max_bytes=max_bytes,
        )
    except AudioTooLargeError:
        return jsonify({
            'error': 'Audio file too large',
            'code': 'audio_too_large',
            'max_bytes': max_bytes,
        }), 413
    except OSError as exc:
        logger.exception("upload: filesystem failure for %s", meeting_id)
        return jsonify({'error': f'Failed to save audio: {exc}'}), 500

    duration_s = meeting_storage.probe_duration_seconds(absolute_path)

    create_data = {
        '_id': meeting_id,
        'original_filename': file_storage.filename or 'audio',
        'audio_path': absolute_path,
        'title': title or file_storage.filename or 'Untitled meeting',
        'duration_s': duration_s,
        'num_speakers': num_speakers,
        'meeting_brief': meeting_brief,
        'series_id': series_id,
        'status': MEETING_STATUS['UPLOADED'],
        'speakers': [],
    }

    try:
        MeetingModel.create(user_id, create_data)
    except Exception as exc:
        logger.exception("upload: failed to insert meeting doc")
        # Best-effort cleanup of the on-disk file before bubbling.
        try:
            Path(absolute_path).unlink(missing_ok=True)
        except Exception:
            pass
        return jsonify({'error': f'Failed to create meeting: {exc}'}), 500

    # Dispatch the background pipeline. Thread captures the current app.
    _dispatch_pipeline(meeting_id)

    meeting = MeetingModel.find_by_id(meeting_id)
    return jsonify({
        'message': 'Meeting upload accepted',
        'meeting': _serialize_meeting(meeting),
        'bytes_written': written_bytes,
    }), 201


# ---------------------------------------------------------------------------
# GET / — list meetings for the current user.
# ---------------------------------------------------------------------------

@meetings_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def list_meetings():
    user = get_current_user()
    user_id = str(user['_id'])

    series_id = (request.args.get('series_id') or '').strip() or None
    q = (request.args.get('q') or '').strip() or None

    meetings = MeetingModel.list_for_user(user_id, series_id=series_id, q=q)
    return jsonify({'meetings': [_serialize_meeting(m) for m in meetings]}), 200


# ---------------------------------------------------------------------------
# GET /suggest-series — fuzzy match incoming title against user's series.
# Defined BEFORE GET /<mid> so the literal segment wins routing.
# ---------------------------------------------------------------------------

@meetings_bp.route('/suggest-series', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def suggest_series_route():
    user = get_current_user()
    title = (request.args.get('title') or '').strip()
    if not title:
        return jsonify({'suggestion': None}), 200

    suggestion = series_match.suggest_series(title, owner_id=user['_id'])
    if suggestion is None:
        return jsonify({'suggestion': None}), 200

    return jsonify({
        'suggestion': {
            'series_id': suggestion.series_id,
            'name': suggestion.name,
            'score': suggestion.score,
        }
    }), 200


# ---------------------------------------------------------------------------
# GET /<meeting_id>
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def get_meeting(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    return jsonify({'meeting': _serialize_meeting(meeting)}), 200


# ---------------------------------------------------------------------------
# PATCH /<meeting_id> — body {title?, series_id?}.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>', methods=['PATCH'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def patch_meeting(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    data = request.get_json(silent=True) or {}
    update: dict = {}

    if 'title' in data:
        title = data.get('title')
        if title is None:
            update['title'] = None
        elif isinstance(title, str):
            update['title'] = title.strip() or None
        else:
            return jsonify({'error': 'title must be a string'}), 400

    if 'series_id' in data:
        series_id = data.get('series_id')
        if series_id is None or (isinstance(series_id, str) and series_id.strip() == ''):
            update['series_id'] = None
        elif isinstance(series_id, str):
            update['series_id'] = series_id.strip()
        else:
            return jsonify({'error': 'series_id must be a string or null'}), 400

    if not update:
        return jsonify({'error': 'No mutable fields supplied'}), 400

    MeetingModel.update(meeting_id, user_id, update)
    refreshed = MeetingModel.find_owned(meeting_id, user_id)
    return jsonify({'meeting': _serialize_meeting(refreshed)}), 200


# ---------------------------------------------------------------------------
# DELETE /<meeting_id> — cascade audio + transcript + summaries.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def delete_meeting(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    # Best-effort cleanup ordering: audio first, then transcript, then summaries,
    # finally the meeting doc itself.
    audio_path = meeting.get('audio_path')
    if audio_path:
        try:
            Path(audio_path).unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("delete: failed to unlink audio %s: %s", audio_path, exc)

    try:
        MeetingTranscriptModel.delete(meeting_id)
    except Exception as exc:
        logger.warning("delete: transcript cascade failed for %s: %s", meeting_id, exc)

    try:
        MeetingSummaryModel.delete_for_meeting(meeting_id)
    except Exception as exc:
        logger.warning("delete: summaries cascade failed for %s: %s", meeting_id, exc)

    deleted = MeetingModel.delete(meeting_id, user_id)
    if not deleted:
        return jsonify({'error': 'Failed to delete meeting'}), 500

    return jsonify({'message': 'Meeting deleted'}), 200


# ---------------------------------------------------------------------------
# GET /<meeting_id>/transcript
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/transcript', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def get_transcript(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    if not MeetingModel.find_owned(meeting_id, user_id):
        return jsonify({'error': 'Meeting not found'}), 404
    transcript = MeetingTranscriptModel.find_by_meeting(meeting_id)
    if not transcript:
        return jsonify({'error': 'Transcript not available yet'}), 404
    return jsonify({'transcript': _serialize_transcript(transcript)}), 200


# ---------------------------------------------------------------------------
# GET /<meeting_id>/summary — latest summary doc.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/summary', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def get_summary(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    if not MeetingModel.find_owned(meeting_id, user_id):
        return jsonify({'error': 'Meeting not found'}), 404
    summary = MeetingSummaryModel.find_latest_for_meeting(meeting_id)
    if not summary:
        return jsonify({'error': 'Summary not available yet'}), 404
    return jsonify({'summary': _serialize_summary(summary)}), 200


# ---------------------------------------------------------------------------
# GET /<meeting_id>/audio — owner-only file stream (404 not 403).
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/audio', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def get_audio(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    audio_path = meeting.get('audio_path')
    if not audio_path:
        return jsonify({'error': 'Meeting not found'}), 404

    path = Path(audio_path)
    if not path.is_file():
        return jsonify({'error': 'Meeting not found'}), 404

    return send_from_directory(str(path.parent), path.name)


# ---------------------------------------------------------------------------
# PATCH /<meeting_id>/speakers/<speaker_id> — rename one embedded speaker.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/speakers/<speaker_id>', methods=['PATCH'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def rename_speaker(meeting_id: str, speaker_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    data = request.get_json(silent=True) or {}
    raw = data.get('display_name')
    display_name: Optional[str]
    if raw is None:
        display_name = None
    elif isinstance(raw, str):
        display_name = raw.strip() or None
    else:
        return jsonify({'error': 'display_name must be a string or null'}), 400

    MeetingModel.set_speaker_name(meeting_id, speaker_id, display_name)

    # Sync to series glossary + speaker-name memory if this meeting belongs
    # to a recurring series (matches the upstream rename UX).
    series_id = meeting.get('series_id')
    if series_id and display_name:
        try:
            meeting_glossary.upsert_speaker_name(series_id, display_name)
        except Exception as exc:
            logger.warning("rename_speaker: speaker_name memory upsert failed: %s", exc)
        try:
            meeting_glossary.add_suggested_terms(series_id, [display_name])
        except Exception as exc:
            logger.warning("rename_speaker: glossary suggestion push failed: %s", exc)

    refreshed = MeetingModel.find_owned(meeting_id, user_id)
    return jsonify({'meeting': _serialize_meeting(refreshed)}), 200


# ---------------------------------------------------------------------------
# POST /<meeting_id>/cancel — synchronous status flip + signal pipeline.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/cancel', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def cancel_meeting(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    current_status = meeting.get('status')
    if current_status == MEETING_STATUS['DONE']:
        return jsonify({'error': 'Meeting already complete; cannot cancel'}), 409

    # Sync flip for instant UI feedback. The pipeline reads
    # CANCELLED_SENTINEL on the error_message field to distinguish a user
    # cancel from a real failure.
    MeetingModel.set_status(
        meeting_id, MEETING_STATUS['FAILED'],
        error_message=meetings_pipeline.CANCELLED_SENTINEL,
    )
    meetings_pipeline.request_cancel(meeting_id)

    refreshed = MeetingModel.find_owned(meeting_id, user_id)
    return jsonify({'meeting': _serialize_meeting(refreshed)}), 200


# ---------------------------------------------------------------------------
# POST /<meeting_id>/regenerate-summary
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/regenerate-summary', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def regenerate_summary_route(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    transcript = MeetingTranscriptModel.find_by_meeting(meeting_id)
    if not transcript:
        return jsonify({'error': 'Cannot regenerate: no transcript for this meeting'}), 400

    # Sync flip so the UI sees `summarizing` immediately.
    MeetingModel.set_status(
        meeting_id, MEETING_STATUS['SUMMARIZING'], error_message=None,
    )

    _dispatch_regenerate(meeting_id)

    refreshed = MeetingModel.find_owned(meeting_id, user_id)
    return jsonify({
        'message': 'Summary regeneration started',
        'meeting': _serialize_meeting(refreshed),
    }), 202


# ---------------------------------------------------------------------------
# POST /<meeting_id>/spawn-conversation — seed a uni-chat conversation.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/spawn-conversation', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def spawn_conversation(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    transcript = MeetingTranscriptModel.find_by_meeting(meeting_id)
    summary = MeetingSummaryModel.find_latest_for_meeting(meeting_id)

    seed_text = build_seed_text(meeting, transcript, summary)

    title_source = meeting.get('title') or meeting.get('original_filename') or 'Untitled'
    conversation = ConversationModel.create(
        user_id=user['_id'],
        config_id=f'quick:{MEETING_DISCUSSION_MODEL}',
        title=f'Meeting: {title_source}'[:200],
    )
    conv_id = conversation['_id']

    MessageModel.create(
        conversation_id=conv_id,
        role='system',
        content=seed_text,
        metadata={'source': 'meeting', 'meeting_id': meeting_id},
    )
    ConversationModel.increment_message_count(conv_id)

    return jsonify({
        'conversation_id': str(conv_id),
        'message': 'Conversation seeded with meeting context',
    }), 201


# ---------------------------------------------------------------------------
# POST /<meeting_id>/save-artifact — push a summary artifact into Knowledge.
# ---------------------------------------------------------------------------

_VALID_ARTIFACT_KINDS = {
    'exec_summary',
    'action_items',
    'decisions',
    'minutes',
    'qa',
    'open_questions',
    'email_draft',
    'transcript',
}


def _render_artifact(meeting: dict, summary: dict | None, transcript: dict | None, kind: str) -> tuple[str | None, str]:
    """Return (content_text, suggested_title_fragment) for an artifact kind.

    Content is plain markdown. Returns (None, _) if the source data is missing.
    """
    title_source = (meeting.get('title') or meeting.get('original_filename') or 'Untitled').strip()

    if kind == 'transcript':
        if not transcript:
            return None, 'Transcript'
        plain = (transcript.get('plain_text') or '').strip()
        if not plain:
            return None, 'Transcript'
        return f"# Transcript — {title_source}\n\n{plain}", 'Transcript'

    if not summary:
        return None, kind

    if kind == 'exec_summary':
        txt = (summary.get('exec_summary') or '').strip()
        return (f"# Executive Summary — {title_source}\n\n{txt}" if txt else None, 'Executive Summary')

    if kind == 'action_items':
        items = summary.get('action_items_json') or []
        if not items:
            return None, 'Action Items'
        lines = [f"# Action Items — {title_source}", ""]
        for item in items:
            text = (item.get('text') or '').strip()
            owner = (item.get('owner') or '').strip()
            due = (item.get('due_date') or '').strip()
            bits = [text]
            meta = []
            if owner:
                meta.append(f"@{owner}")
            if due:
                meta.append(f"due {due}")
            if meta:
                bits.append(f"_({', '.join(meta)})_")
            lines.append(f"- {' '.join(b for b in bits if b)}".rstrip())
        return '\n'.join(lines), 'Action Items'

    if kind == 'decisions':
        items = summary.get('decisions_json') or []
        if not items:
            return None, 'Decisions'
        lines = [f"# Decisions — {title_source}", ""]
        for entry in items:
            if isinstance(entry, str) and entry.strip():
                lines.append(f"- {entry.strip()}")
        return '\n'.join(lines), 'Decisions'

    if kind == 'minutes':
        items = summary.get('minutes_json') or []
        if not items:
            return None, 'Minutes'
        lines = [f"# Minutes — {title_source}", ""]
        for entry in items:
            speaker = (entry.get('speaker_id') or '').strip() or 'speaker_?'
            text = (entry.get('text') or '').strip()
            if not text:
                continue
            start = entry.get('start_s')
            end = entry.get('end_s')
            tag = ''
            if isinstance(start, (int, float)) and isinstance(end, (int, float)):
                tag = f" `[{float(start):.2f}-{float(end):.2f}]`"
            lines.append(f"- **{speaker}**{tag}: {text}")
        return '\n'.join(lines), 'Minutes'

    if kind == 'qa':
        items = summary.get('qa_json') or []
        if not items:
            return None, 'Q&A'
        lines = [f"# Q&A — {title_source}", ""]
        for entry in items:
            q = (entry.get('question') or '').strip()
            a = (entry.get('answer') or '').strip()
            if not q:
                continue
            lines.append(f"- **Q:** {q}")
            if a:
                lines.append(f"  **A:** {a}")
        return '\n'.join(lines), 'Q&A'

    if kind == 'open_questions':
        items = summary.get('open_questions_json') or []
        if not items:
            return None, 'Open Questions'
        lines = [f"# Open Questions — {title_source}", ""]
        for entry in items:
            q = (entry.get('question') or '').strip()
            owner = (entry.get('owner') or '').strip()
            if not q:
                continue
            line = f"- {q}"
            if owner:
                line += f" _({owner})_"
            lines.append(line)
        return '\n'.join(lines), 'Open Questions'

    if kind == 'email_draft':
        subject = (summary.get('email_subject') or '').strip()
        body = (summary.get('email_draft') or '').strip()
        if not subject and not body:
            return None, 'Follow-up Email'
        lines = [f"# Follow-up Email — {title_source}", ""]
        if subject:
            lines.append(f"**Subject:** {subject}")
            lines.append("")
        if body:
            lines.append(body)
        return '\n'.join(lines), 'Follow-up Email'

    return None, kind


def _find_or_create_meeting_folder(user_id: str, meeting: dict) -> str:
    """Return a folder_id (string) for storing this meeting's artifacts.

    Uses the meeting title as the folder name; falls back to ``original_filename``.
    Personal-scope only (no project_id) for v1.
    """
    folder_name = (meeting.get('title') or meeting.get('original_filename') or 'Meeting')[:100]
    # KnowledgeFolder unique constraint is on (scope_key, name). For personal
    # scope, scope_key = f'u:{user_id}'.
    scope_key = KnowledgeFolderModel._compute_scope_key(ObjectId(user_id), None)
    existing = KnowledgeFolderModel.get_collection().find_one({
        'scope_key': scope_key,
        'name': folder_name,
    })
    if existing:
        return str(existing['_id'])
    folder = KnowledgeFolderModel.create(user_id=user_id, name=folder_name)
    return str(folder['_id'])


@meetings_bp.route('/<meeting_id>/save-artifact', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def save_artifact(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    data = request.get_json(silent=True) or {}
    kind = (data.get('artifact_kind') or '').strip()
    if kind not in _VALID_ARTIFACT_KINDS:
        return jsonify({
            'error': f"Invalid artifact_kind. Must be one of {sorted(_VALID_ARTIFACT_KINDS)}",
        }), 400

    transcript = MeetingTranscriptModel.find_by_meeting(meeting_id)
    summary = MeetingSummaryModel.find_latest_for_meeting(meeting_id)

    content, kind_label = _render_artifact(meeting, summary, transcript, kind)
    if not content:
        return jsonify({'error': f'No content available for artifact_kind={kind}'}), 400

    folder_id_raw = data.get('folder_id')
    folder_id = (folder_id_raw or '').strip() if isinstance(folder_id_raw, str) else None
    if not folder_id:
        folder_id = _find_or_create_meeting_folder(user_id, meeting)

    title_source = (meeting.get('title') or meeting.get('original_filename') or 'Untitled').strip()
    item_title = f"{title_source} — {kind_label}"[:200]

    item = KnowledgeItemModel.create(
        user_id=user_id,
        source_type='meeting',
        source_id=meeting_id,
        content=content,
        title=item_title,
        folder_id=folder_id,
        metadata={'artifact_kind': kind},
    )

    return jsonify({
        'message': 'Artifact saved to Knowledge Vault',
        'item': serialize_doc(item),
        'folder_id': folder_id,
    }), 201


# ---------------------------------------------------------------------------
# GET /<meeting_id>/stream — SSE pipeline status.
# ---------------------------------------------------------------------------

@meetings_bp.route('/<meeting_id>/stream', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def stream_status(meeting_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    meeting = MeetingModel.find_owned(meeting_id, user_id)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404

    app = current_app._get_current_object()

    def generate():
        start_time = time.time()
        last_keepalive = start_time
        last_status: Optional[str] = None

        # Emit a synthetic "current state" event up-front so the client can
        # render an accurate UI immediately, regardless of which phase the
        # pipeline is in.
        try:
            with app.app_context():
                doc = MeetingModel.find_by_id(meeting_id) or {}
            initial_status = doc.get('status')
            if initial_status is not None:
                last_status = initial_status
                yield _sse_event('phase_change', {
                    'status': initial_status,
                    'error_message': doc.get('error_message'),
                })
                if initial_status in _TERMINAL_STATUSES:
                    final_event = 'meeting_complete' if initial_status == MEETING_STATUS['DONE'] else 'error'
                    payload = {'status': initial_status, 'error_message': doc.get('error_message')}
                    yield _sse_event(final_event, payload)
                    return
        except Exception as exc:
            logger.exception("stream: initial poll failed for %s", meeting_id)
            yield _sse_event('error', {'message': str(exc), 'code': 'stream_init_failed'})
            return

        # Poll loop.
        while True:
            elapsed = time.time() - start_time
            if elapsed > _SSE_MAX_WALLCLOCK_S:
                yield _sse_event('error', {
                    'message': 'SSE wallclock exceeded',
                    'code': 'sse_timeout',
                })
                return

            now = time.time()
            if now - last_keepalive >= _KEEPALIVE_INTERVAL_S:
                yield ":keepalive\n\n"
                last_keepalive = now

            try:
                with app.app_context():
                    doc = MeetingModel.find_by_id(meeting_id) or {}
            except Exception as exc:
                logger.warning("stream: poll error for %s: %s", meeting_id, exc)
                time.sleep(_POLL_INTERVAL_S)
                continue

            status = doc.get('status')
            if status != last_status:
                last_status = status
                yield _sse_event('phase_change', {
                    'status': status,
                    'error_message': doc.get('error_message'),
                })

            if status == MEETING_STATUS['DONE']:
                yield _sse_event('meeting_complete', {'status': status})
                return
            if status == MEETING_STATUS['FAILED']:
                yield _sse_event('error', {
                    'status': status,
                    'error_message': doc.get('error_message'),
                })
                return

            if status not in _IN_FLIGHT_STATUSES:
                # Unknown / stale status — bail rather than loop forever.
                yield _sse_event('error', {
                    'message': f'Unknown status: {status!r}',
                    'code': 'unknown_status',
                })
                return

            time.sleep(_POLL_INTERVAL_S)

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )
