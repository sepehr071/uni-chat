"""
Meetings pipeline — drives a meeting through
``uploaded → transcribing → summarizing → done`` (or ``failed``).

Run from a background ``threading.Thread`` launched by the upload /
regenerate routes. The caller is expected to wrap each call in a Flask
``app.app_context()`` so PyMongo + ``current_app.config`` lookups work
from the worker thread (see CLAUDE.md "Eventlet greenlets + Flask app
context").

Cancellation is process-local: a dict of ``threading.Event`` keyed by
``meeting_id``. The route flips the meeting to ``failed`` synchronously
for instant UI feedback; this module just stops doing more work at the
next safe boundary so we don't burn another Scribe / OpenRouter call.
"""
from __future__ import annotations

import logging
import threading
import traceback
from pathlib import Path
from typing import Optional

from app.models.meeting import MEETING_STATUS, MeetingModel
from app.models.meeting_series import MeetingSeriesModel
from app.models.meeting_summary import MeetingSummaryModel
from app.models.meeting_transcript import MeetingTranscriptModel
from app.services import meeting_glossary
from app.services import summary_service
from app.services import transcription_service
from app.services.dlp_gate import DLPBlockedError, gate as dlp_gate
from app.services.summary_service import EMAIL_TONE_CASUAL, EMAIL_TONE_FORMAL

logger = logging.getLogger(__name__)


# Marker the cancel endpoint writes into ``meetings.error_message`` so the
# UI can distinguish user-cancelled runs from genuine failures.
CANCELLED_SENTINEL = "cancelled by user"

# Gap (seconds) between consecutive words large enough to split a segment
# even when the speaker hasn't changed. Mirrors the upstream pipeline.
_GAP_THRESHOLD_S = 1.2


# Process-local cancellation registry. Single-process Flask only — multi-
# worker deployments would need a shared store, but v1 is single-process.
_cancel_events: dict[str, threading.Event] = {}
_cancel_lock = threading.Lock()


# The 7 summary artifacts produced from a single LLM call. Each is scanned
# independently so DLP event records carry per-artifact attribution — useful
# when v2 attaches workspace_id and the events surface in the admin DLP view.
_SUMMARY_ARTIFACTS = (
    'exec_summary',
    'action_items',
    'decisions',
    'qa',
    'open_questions',
    'email_draft',
    'speaker_names',
)


class _DLPBlocked(Exception):
    """Internal marker — DLP blocked at a pipeline boundary.

    Carries a friendly message so the pipeline can record it on the
    ``meetings.error_message`` field when flipping to FAILED. Distinct from
    ``DLPBlockedError`` so the pipeline's broad ``except Exception`` doesn't
    swallow it into a traceback dump.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class _CancelledByUser(Exception):
    """Raised at safe boundaries when the user requested a cancel."""


def request_cancel(meeting_id: str) -> bool:
    """Signal an in-flight pipeline to abort at its next safe boundary.

    Best-effort: ElevenLabs Scribe HTTP can't be torn down mid-call, so the
    abort happens after the next checkpoint. The route flips status to
    FAILED synchronously for instant UI feedback.

    Returns False if there is no in-flight pipeline registered for this id.
    """
    with _cancel_lock:
        ev = _cancel_events.get(meeting_id)
    if ev is None:
        return False
    ev.set()
    return True


def _check_cancel(ev: threading.Event) -> None:
    if ev.is_set():
        raise _CancelledByUser


def _register_cancel_event(meeting_id: str) -> threading.Event:
    ev = threading.Event()
    with _cancel_lock:
        _cancel_events[meeting_id] = ev
    return ev


def _unregister_cancel_event(meeting_id: str) -> None:
    with _cancel_lock:
        _cancel_events.pop(meeting_id, None)


# ---------------------------------------------------------------------------
# Word helpers — ported verbatim from upstream pipeline (lines 48-77).
# ---------------------------------------------------------------------------

def _word_text(word: dict) -> str:
    return word.get('text', '') or ''


def _word_speaker(word: dict) -> str | None:
    sid = word.get('speaker_id')
    if sid is None:
        return None
    return str(sid)


def _word_start(word: dict) -> float | None:
    val = word.get('start')
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _word_end(word: dict) -> float | None:
    val = word.get('end')
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _segment_words(words: list[dict]) -> list[tuple[str, float, float, str]]:
    """Group consecutive same-speaker words into segments.

    Split rules:
      * speaker change
      * ``word.start - prev_end > _GAP_THRESHOLD_S`` (default 1.2s)
    Missing timestamps fall back to the previous segment's endpoints so
    grouping keeps making progress.
    """
    segments: list[tuple[str, float, float, str]] = []

    cur_speaker: str | None = None
    cur_start: float | None = None
    cur_end: float | None = None
    cur_text_parts: list[str] = []

    def flush() -> None:
        if cur_speaker is None or cur_start is None or cur_end is None:
            return
        text = ''.join(cur_text_parts).strip()
        if not text:
            return
        segments.append((cur_speaker, cur_start, cur_end, text))

    for word in words:
        speaker = _word_speaker(word) or 'speaker_0'
        start = _word_start(word)
        end = _word_end(word)
        text = _word_text(word)

        # If we have no timing, fall back to previous endpoints to keep grouping.
        effective_start = start if start is not None else cur_end
        effective_end = end if end is not None else effective_start

        gap = None
        if cur_end is not None and effective_start is not None:
            gap = effective_start - cur_end

        speaker_changed = cur_speaker is not None and speaker != cur_speaker
        gap_too_big = gap is not None and gap > _GAP_THRESHOLD_S

        if cur_speaker is None:
            cur_speaker = speaker
            cur_start = effective_start if effective_start is not None else 0.0
            cur_end = effective_end if effective_end is not None else cur_start
            cur_text_parts = [text]
            continue

        if speaker_changed or gap_too_big:
            flush()
            cur_speaker = speaker
            cur_start = effective_start if effective_start is not None else (cur_end or 0.0)
            cur_end = effective_end if effective_end is not None else cur_start
            cur_text_parts = [text]
        else:
            cur_text_parts.append(text)
            if effective_end is not None:
                cur_end = effective_end

    flush()
    return segments


def build_diarized_prompt(words: list[dict]) -> str:
    """`[speaker_id start-end] text` lines for the LLM prompt."""
    return '\n'.join(
        f'[{speaker} {start:.2f}-{end:.2f}] {text}'
        for speaker, start, end, text in _segment_words(words)
    )


def build_minutes_segments(words: list[dict]) -> list[dict]:
    """Server-side minutes built directly from the diarized words.

    Bypasses the LLM so 1h+ meetings don't get truncated by output-token
    limits. Each segment carries the speaker id, the joined Persian text,
    and start/end second offsets.
    """
    return [
        {
            'speaker_id': speaker,
            'text': text,
            'start_s': start,
            'end_s': end,
        }
        for speaker, start, end, text in _segment_words(words)
    ]


# ---------------------------------------------------------------------------
# Speaker-name mapping — manual edits always win.
# ---------------------------------------------------------------------------

def apply_speaker_names(meeting: dict, mapping: list[dict] | None) -> int:
    """Apply LLM-suggested speaker names to a meeting's embedded speakers.

    Manual-edit-wins: any embedded speaker that already has a non-empty
    ``display_name`` is left alone (it was set by the user via the rename
    endpoint). Newly-applied names are also pushed into the series
    glossary + speaker-name memory when the meeting belongs to a series.

    Returns the number of speaker rows that were actually updated.
    """
    if not mapping:
        return 0

    meeting_id = meeting.get('_id')
    if not meeting_id:
        return 0

    existing_speakers = list(meeting.get('speakers') or [])
    # Build a quick lookup: speaker_id -> existing display_name (str or None).
    existing_by_id = {
        s.get('speaker_id'): (s.get('display_name') or '').strip()
        for s in existing_speakers
        if s.get('speaker_id')
    }

    applied = 0
    applied_names: list[str] = []
    for entry in mapping:
        speaker_id = (entry or {}).get('speaker_id')
        new_name = ((entry or {}).get('display_name') or '').strip()
        if not speaker_id or not new_name:
            continue
        # Manual-edit-wins: skip when this speaker already has a non-empty name.
        if existing_by_id.get(speaker_id):
            continue
        ok = MeetingModel.set_speaker_name(meeting_id, speaker_id, new_name)
        if ok:
            applied += 1
            applied_names.append(new_name)
            existing_by_id[speaker_id] = new_name

    series_id = meeting.get('series_id')
    if series_id and applied_names:
        # Update the per-series speaker-name memory + glossary suggestions
        # so future meetings in this series benefit from the new mapping.
        for name in applied_names:
            try:
                meeting_glossary.upsert_speaker_name(series_id, name)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "speaker_name memory upsert failed (series=%s, name=%s): %s",
                    series_id, name, exc,
                )
        try:
            meeting_glossary.add_suggested_terms(series_id, applied_names)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "glossary suggested-terms push failed (series=%s): %s",
                series_id, exc,
            )

    return applied


# ---------------------------------------------------------------------------
# Pipeline-internal helpers — small functions so the state machine reads
# top-to-bottom.
# ---------------------------------------------------------------------------

class _MeetingCtx:
    __slots__ = (
        'audio_path',
        'num_speakers',
        'meeting_brief',
        'series_id',
        'email_tone',
        'keyterms',
        'series_name',
    )

    def __init__(
        self,
        audio_path: str,
        num_speakers: int | None,
        meeting_brief: str | None,
        series_id: str | None,
        email_tone: str,
        keyterms: list[str],
        series_name: str | None,
    ) -> None:
        self.audio_path = audio_path
        self.num_speakers = num_speakers
        self.meeting_brief = meeting_brief
        self.series_id = series_id
        self.email_tone = email_tone
        self.keyterms = keyterms
        self.series_name = series_name


def _load_meeting_context(meeting: dict) -> _MeetingCtx:
    series_id = meeting.get('series_id')
    email_tone = EMAIL_TONE_FORMAL
    keyterms: list[str] = []
    series_name: Optional[str] = None
    if series_id:
        series = MeetingSeriesModel.find_by_id(series_id)
        if series is not None:
            raw_tone = (series.get('email_tone') or '').lower()
            email_tone = EMAIL_TONE_CASUAL if raw_tone == EMAIL_TONE_CASUAL else EMAIL_TONE_FORMAL
            series_name = series.get('name')
        keyterms = meeting_glossary.get_active_keyterms(series_id)
    return _MeetingCtx(
        audio_path=meeting.get('audio_path', ''),
        num_speakers=meeting.get('num_speakers'),
        meeting_brief=meeting.get('meeting_brief'),
        series_id=series_id,
        email_tone=email_tone,
        keyterms=keyterms,
        series_name=series_name,
    )


def _build_summary_context(ctx: _MeetingCtx) -> str | None:
    """Assemble the per-meeting context block fed to the summarizer.

    Combines the user-provided meeting brief with the series name (when
    present) and known speaker-name memory so the LLM can map speaker_ids
    consistently across recurring meetings.
    """
    sections: list[str] = []
    if ctx.series_name:
        sections.append(f"Recurring series: {ctx.series_name}")
    if ctx.series_id:
        try:
            known_names = meeting_glossary.list_speaker_names(ctx.series_id)
        except Exception:
            known_names = []
        if known_names:
            sections.append(
                "Known speakers from prior meetings in this series: "
                + ", ".join(known_names[:20])
            )
    if ctx.meeting_brief and ctx.meeting_brief.strip():
        sections.append(ctx.meeting_brief.strip())
    if not sections:
        return None
    return "\n\n".join(sections)


def _persist_transcript(meeting_id: str, result, ctx: _MeetingCtx) -> list[dict]:
    """Write the transcript doc, refresh embedded speakers, return words.

    Existing embedded ``speakers`` rows (with their manual ``display_name``
    edits) are preserved — only newly-discovered speaker_ids get appended.
    """
    MeetingTranscriptModel.create(
        meeting_id,
        {
            'raw_json': result.raw,
            'plain_text': result.plain_text,
            'words_json': result.words,
            'language_code': result.language_code or 'fas',
        },
    )

    # Merge in any new speakers Scribe discovered without clobbering manual
    # edits the user may have made on a prior re-run.
    meeting_doc = MeetingModel.find_by_id(meeting_id) or {}
    existing_speakers = list(meeting_doc.get('speakers') or [])
    existing_ids = {s.get('speaker_id') for s in existing_speakers if s.get('speaker_id')}
    appended = False
    for sid in result.speaker_ids:
        if sid in existing_ids:
            continue
        existing_speakers.append({'speaker_id': sid, 'display_name': None})
        existing_ids.add(sid)
        appended = True
    if appended:
        MeetingModel.upsert_speakers(meeting_id, existing_speakers)

    # Reflect the detected language code on the meeting too (Scribe may
    # echo a normalised variant; trust whatever it returned).
    update_doc: dict = {}
    if result.language_code:
        update_doc['language'] = result.language_code
    if update_doc:
        # owner_id check is bypassed — this thread runs after the route
        # already verified ownership. Touch the document directly.
        MeetingModel.get_collection().update_one(
            {'_id': meeting_id},
            {'$set': update_doc},
        )

    return list(result.words)


def _persist_summary(meeting_id: str, data: dict, *, email_tone: str) -> str:
    """Insert a summary doc and mark the meeting DONE.

    Returns the new ``meeting_summaries._id`` as a string.
    """
    email_obj = data.get('email_draft') or {}
    summary_id = MeetingSummaryModel.create(
        meeting_id,
        {
            'exec_summary': data.get('exec_summary', '') or '',
            'action_items_json': list(data.get('action_items') or []),
            'decisions_json': list(data.get('decisions') or []),
            'minutes_json': list(data.get('minutes') or []),
            'qa_json': list(data.get('qa') or []),
            'open_questions_json': list(data.get('open_questions') or []),
            'email_subject': email_obj.get('subject') or None,
            'email_draft': email_obj.get('body') or None,
            'email_tone': email_tone if email_tone in {EMAIL_TONE_FORMAL, EMAIL_TONE_CASUAL} else None,
            'model': summary_service.MEETING_SUMMARY_MODEL,
        },
    )
    MeetingModel.set_latest_summary(meeting_id, summary_id)
    MeetingModel.set_status(meeting_id, MEETING_STATUS['DONE'], error_message=None)
    return summary_id


def _fail(meeting_id: str, error_text: str) -> None:
    """Helper — flip a meeting to FAILED with an error_message payload."""
    try:
        MeetingModel.set_status(
            meeting_id, MEETING_STATUS['FAILED'], error_message=error_text,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("failed to record FAILED status for %s: %s", meeting_id, exc)


def _scan_dlp(
    *,
    meeting_id: str,
    owner_id,
    text: str,
    phase: str,
    artifact: Optional[str] = None,
) -> None:
    """Run the DLP gate at a meetings-pipeline boundary.

    Personal-scope v1 carries ``workspace_id=None`` → the gate short-circuits
    server-side (see ``services/dlp_gate.py`` ``if not workspace_id: return``).
    We still wire the call for v2 forward-compat: once workspace_id is
    attached to meetings the same chokepoint will produce events without a
    second code change.

    On block / require_confirm the underlying ``DLPBlockedError`` is
    re-raised as ``_DLPBlocked`` so ``run_pipeline`` can record a friendly
    reason on the meeting and stop the run cleanly.
    """
    if not text or not owner_id:
        return
    source_ref: dict = {'meeting_id': meeting_id, 'phase': phase}
    if artifact is not None:
        source_ref['artifact'] = artifact
    try:
        dlp_gate(
            text=text,
            user_id=owner_id,
            workspace_id=None,
            project_id=None,
            source='meeting',
            source_ref=source_ref,
        )
    except DLPBlockedError as exc:
        # Block is non-overridable; require_confirm can't be confirmed from a
        # background worker — both map to a hard stop here.
        rule_names = ', '.join(
            sorted({(m.get('rule_name') or m.get('rule_id') or '?') for m in exc.matches})
        )
        scope = artifact or phase
        raise _DLPBlocked(
            f"Blocked by Content Safety ({scope}): {rule_names or exc.code}"
        ) from exc


# ---------------------------------------------------------------------------
# State machine: run_pipeline + regenerate_summary
# ---------------------------------------------------------------------------

def run_pipeline(meeting_id: str) -> None:
    """Drive a meeting through transcribing → summarizing → done.

    Idempotent: returns immediately if the meeting is already DONE.
    Must be invoked from within ``with app.app_context():`` — the calling
    route is responsible for capturing the app object and wrapping the
    call. See CLAUDE.md "Eventlet greenlets + Flask app context".
    """
    meeting = MeetingModel.find_by_id(meeting_id)
    if meeting is None:
        logger.warning("run_pipeline: meeting %s not found", meeting_id)
        return
    if meeting.get('status') == MEETING_STATUS['DONE']:
        return

    cancel_ev = _register_cancel_event(meeting_id)
    try:
        # ---- TRANSCRIBE ----
        MeetingModel.set_status(
            meeting_id, MEETING_STATUS['TRANSCRIBING'], error_message=None,
        )
        _check_cancel(cancel_ev)

        # Reload to capture the status flip + any concurrent edits.
        meeting = MeetingModel.find_by_id(meeting_id) or meeting
        ctx = _load_meeting_context(meeting)
        if not ctx.audio_path:
            raise RuntimeError("meeting has no audio_path")

        result = transcription_service.transcribe(
            Path(ctx.audio_path),
            num_speakers=ctx.num_speakers,
            keyterms=ctx.keyterms or None,
        )
        _check_cancel(cancel_ev)

        words = _persist_transcript(meeting_id, result, ctx)
        _check_cancel(cancel_ev)
        if not words:
            raise RuntimeError("transcript persisted but words_json is empty")

        # DLP gate — scan the freshly-transcribed text. Personal-scope v1 is a
        # no-op (workspace_id=None), but the call is wired for v2 forward-compat
        # so transcripts surface in the admin DLP view once workspace_id lands.
        _scan_dlp(
            meeting_id=meeting_id,
            owner_id=meeting.get('owner_id'),
            text=result.plain_text or '',
            phase='transcript',
        )
        _check_cancel(cancel_ev)

        # ---- SUMMARIZE ----
        MeetingModel.set_status(
            meeting_id, MEETING_STATUS['SUMMARIZING'], error_message=None,
        )
        _check_cancel(cancel_ev)

        meeting = MeetingModel.find_by_id(meeting_id) or meeting
        ctx = _load_meeting_context(meeting)
        owner_id = meeting.get('owner_id')
        user_id_str = str(owner_id) if owner_id else None

        prompt = build_diarized_prompt(words)
        summary_context = _build_summary_context(ctx)

        # DLP gate — the diarized prompt is the user-authored material going
        # outbound to the summarizer LLM. One LLM call produces all 7 artifacts
        # from the same input, but we scan per-artifact so the DLP event log
        # carries per-artifact attribution.
        for artifact in _SUMMARY_ARTIFACTS:
            _scan_dlp(
                meeting_id=meeting_id,
                owner_id=owner_id,
                text=prompt,
                phase='summary_input',
                artifact=artifact,
            )
        _check_cancel(cancel_ev)

        data = summary_service.summarize(
            prompt,
            user_id=user_id_str,
            context=summary_context,
            email_tone=ctx.email_tone,
        )
        _check_cancel(cancel_ev)

        # Minutes are built server-side from the diarized words so 1h+
        # meetings don't get truncated by output-token limits.
        data['minutes'] = build_minutes_segments(words)

        # Apply LLM speaker-name mapping (manual edits always win); also
        # refresh the in-memory meeting dict so apply_speaker_names sees
        # the latest embedded speakers list.
        meeting = MeetingModel.find_by_id(meeting_id) or meeting
        apply_speaker_names(meeting, data.get('speaker_names'))

        _persist_summary(meeting_id, data, email_tone=ctx.email_tone)
    except _CancelledByUser:
        # Route already flipped status to FAILED + sentinel; leave it alone.
        logger.info("meeting %s cancelled by user", meeting_id)
        return
    except _DLPBlocked as dlp_exc:
        # Content Safety hit — flip to FAILED with a user-readable reason
        # instead of a full traceback. Pipeline does not propagate; the SSE
        # status stream surfaces the error_message to the UI.
        logger.info("meeting %s blocked by DLP: %s", meeting_id, dlp_exc.message)
        _fail(meeting_id, dlp_exc.message)
        return
    except Exception:
        tb = traceback.format_exc()
        logger.exception("meeting %s pipeline failed", meeting_id)
        _fail(meeting_id, tb)
    finally:
        _unregister_cancel_event(meeting_id)


def regenerate_summary(meeting_id: str) -> str:
    """Re-run summarization against an existing transcript.

    Returns the new ``meeting_summaries._id`` on success. On cancellation,
    returns an empty string (caller can poll the meeting status). Re-raises
    on hard failure after flipping status to FAILED.

    Must be invoked from within ``with app.app_context():`` (same rule as
    ``run_pipeline``).
    """
    meeting = MeetingModel.find_by_id(meeting_id)
    if meeting is None:
        raise RuntimeError(f"meeting {meeting_id} not found")

    transcript = MeetingTranscriptModel.find_by_meeting(meeting_id)
    if transcript is None:
        raise RuntimeError("cannot regenerate: no transcript for this meeting")
    words = list(transcript.get('words_json') or [])
    if not words:
        raise RuntimeError("cannot regenerate: transcript has no words")

    cancel_ev = _register_cancel_event(meeting_id)
    try:
        MeetingModel.set_status(
            meeting_id, MEETING_STATUS['SUMMARIZING'], error_message=None,
        )
        _check_cancel(cancel_ev)

        meeting = MeetingModel.find_by_id(meeting_id) or meeting
        ctx = _load_meeting_context(meeting)
        owner_id = meeting.get('owner_id')
        user_id_str = str(owner_id) if owner_id else None

        prompt = build_diarized_prompt(words)
        summary_context = _build_summary_context(ctx)

        # DLP gate — per-artifact scan over the diarized prompt. Mirrors
        # ``run_pipeline``; transcript scan is skipped because regeneration
        # never re-uploads or re-transcribes audio.
        for artifact in _SUMMARY_ARTIFACTS:
            _scan_dlp(
                meeting_id=meeting_id,
                owner_id=owner_id,
                text=prompt,
                phase='summary_input',
                artifact=artifact,
            )
        _check_cancel(cancel_ev)

        data = summary_service.summarize(
            prompt,
            user_id=user_id_str,
            context=summary_context,
            email_tone=ctx.email_tone,
        )
        _check_cancel(cancel_ev)

        data['minutes'] = build_minutes_segments(words)
        meeting = MeetingModel.find_by_id(meeting_id) or meeting
        apply_speaker_names(meeting, data.get('speaker_names'))

        return _persist_summary(meeting_id, data, email_tone=ctx.email_tone)
    except _CancelledByUser:
        logger.info("meeting %s regenerate cancelled by user", meeting_id)
        return ''
    except _DLPBlocked as dlp_exc:
        logger.info(
            "meeting %s regenerate blocked by DLP: %s", meeting_id, dlp_exc.message,
        )
        _fail(meeting_id, dlp_exc.message)
        return ''
    except Exception:
        tb = traceback.format_exc()
        logger.exception("meeting %s regenerate failed", meeting_id)
        _fail(meeting_id, tb)
        raise
    finally:
        _unregister_cancel_event(meeting_id)
