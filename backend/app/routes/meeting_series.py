"""
Meeting-series API blueprint — CRUD for recurring meeting groups,
glossary keyterm management (manual/suggested/accepted), and per-series
speaker-name memory.

All routes are personal-scope v1 (owner_id from JWT). All ids are UUID4
strings on the wire (the underlying _id fields are UUID4 strings, NOT
ObjectIds).
"""
from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required
from pymongo.errors import DuplicateKeyError

from app.models.meeting import MeetingModel
from app.models.meeting_series import (
    VALID_EMAIL_TONES,
    VALID_KEYTERM_SOURCES,
    KeytermModel,
    MeetingSeriesModel,
    SpeakerNameModel,
)
from app.services import meeting_glossary
from app.utils.decorators import active_user_required
from app.utils.feature_required import feature_required
from app.utils.helpers import serialize_doc

logger = logging.getLogger(__name__)

meeting_series_bp = Blueprint('meeting_series', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(doc) -> dict:
    return serialize_doc(doc)


def _validate_email_tone(tone: str | None) -> str | None:
    if tone is None:
        return None
    if not isinstance(tone, str) or tone not in VALID_EMAIL_TONES:
        return ''
    return tone


def _owned_series_or_404(series_id: str, user_id: str):
    series = MeetingSeriesModel.find_owned(series_id, user_id)
    if not series:
        return None, (jsonify({'error': 'Series not found'}), 404)
    return series, None


# ---------------------------------------------------------------------------
# GET / — list series w/ meeting count.
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def list_series():
    user = get_current_user()
    user_id = str(user['_id'])

    series_list = MeetingSeriesModel.list_for_user(user_id)

    # Decorate w/ meeting_count — single query for the whole batch.
    out = []
    for s in series_list:
        sid = s.get('_id')
        meeting_count = 0
        if sid:
            try:
                meeting_count = MeetingModel.get_collection().count_documents({
                    'owner_id': user['_id'],
                    'series_id': sid,
                })
            except Exception as exc:
                logger.warning("list_series: count failed for %s: %s", sid, exc)
        item = _serialize(s)
        item['meeting_count'] = meeting_count
        out.append(item)

    return jsonify({'series': out}), 200


# ---------------------------------------------------------------------------
# POST / — create series. 409 on duplicate (owner_id, name).
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/create', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def create_series():
    user = get_current_user()
    user_id = str(user['_id'])

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > 200:
        return jsonify({'error': 'name must be ≤ 200 characters'}), 400

    email_tone_raw = data.get('email_tone', 'formal')
    if email_tone_raw not in VALID_EMAIL_TONES:
        return jsonify({
            'error': f"email_tone must be one of {sorted(VALID_EMAIL_TONES)}",
        }), 400

    try:
        series_id = MeetingSeriesModel.create(user_id, {
            'name': name,
            'email_tone': email_tone_raw,
        })
    except DuplicateKeyError:
        return jsonify({'error': 'A series with this name already exists', 'code': 'duplicate_name'}), 409

    series = MeetingSeriesModel.find_by_id(series_id)
    return jsonify({'series': _serialize(series)}), 201


# ---------------------------------------------------------------------------
# GET /<series_id>
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def get_series(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err
    return jsonify({'series': _serialize(series)}), 200


# ---------------------------------------------------------------------------
# PATCH /<series_id>
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>', methods=['PATCH'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def update_series(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    update: dict = {}

    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        if len(name) > 200:
            return jsonify({'error': 'name must be ≤ 200 characters'}), 400
        update['name'] = name

    if 'email_tone' in data:
        tone = data.get('email_tone')
        if tone not in VALID_EMAIL_TONES:
            return jsonify({
                'error': f"email_tone must be one of {sorted(VALID_EMAIL_TONES)}",
            }), 400
        update['email_tone'] = tone

    if not update:
        return jsonify({'error': 'No mutable fields supplied'}), 400

    try:
        MeetingSeriesModel.update(series_id, user_id, update)
    except DuplicateKeyError:
        return jsonify({'error': 'A series with this name already exists', 'code': 'duplicate_name'}), 409

    refreshed = MeetingSeriesModel.find_owned(series_id, user_id)
    return jsonify({'series': _serialize(refreshed)}), 200


# ---------------------------------------------------------------------------
# DELETE /<series_id> — cascade keyterms + speaker_names + unset meetings.series_id.
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def delete_series(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    try:
        KeytermModel.delete_for_series(series_id)
    except Exception as exc:
        logger.warning("delete_series: keyterm cascade failed for %s: %s", series_id, exc)
    try:
        SpeakerNameModel.delete_for_series(series_id)
    except Exception as exc:
        logger.warning("delete_series: speaker_names cascade failed for %s: %s", series_id, exc)
    try:
        MeetingModel.get_collection().update_many(
            {'owner_id': user['_id'], 'series_id': series_id},
            {'$set': {'series_id': None}},
        )
    except Exception as exc:
        logger.warning("delete_series: meetings unset failed for %s: %s", series_id, exc)

    deleted = MeetingSeriesModel.delete(series_id, user_id)
    if not deleted:
        return jsonify({'error': 'Failed to delete series'}), 500

    return jsonify({'message': 'Series deleted'}), 200


# ---------------------------------------------------------------------------
# GET /<series_id>/keyterms?source=manual|suggested|accepted
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>/keyterms', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def list_keyterms(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    source = (request.args.get('source') or '').strip() or None
    if source and source not in VALID_KEYTERM_SOURCES:
        return jsonify({
            'error': f"source must be one of {sorted(VALID_KEYTERM_SOURCES)}",
        }), 400

    terms = meeting_glossary.list_keyterms(series_id, source=source)
    return jsonify({'keyterms': [_serialize(t) for t in terms]}), 200


# ---------------------------------------------------------------------------
# POST /<series_id>/keyterms — add manual term (promotes SUGGESTED → MANUAL).
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>/keyterms', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def add_keyterm(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    term = (data.get('term') or '').strip()
    if not term:
        return jsonify({'error': 'term is required'}), 400

    doc = meeting_glossary.add_manual_term(series_id, term)
    if doc is None:
        return jsonify({'error': 'term failed validation (length/word-count/numeric-only)'}), 400

    return jsonify({'keyterm': _serialize(doc)}), 201


# ---------------------------------------------------------------------------
# POST /<series_id>/keyterms/<term_id>/accept
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>/keyterms/<term_id>/accept', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def accept_keyterm(series_id: str, term_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    term = KeytermModel.find_by_id(term_id)
    if not term or term.get('series_id') != series_id:
        return jsonify({'error': 'Keyterm not found'}), 404

    ok = meeting_glossary.accept_term(term_id)
    if not ok:
        return jsonify({'error': 'Failed to accept keyterm'}), 500

    refreshed = KeytermModel.find_by_id(term_id)
    return jsonify({'keyterm': _serialize(refreshed)}), 200


# ---------------------------------------------------------------------------
# DELETE /<series_id>/keyterms/<term_id> — reject = delete.
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>/keyterms/<term_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def reject_keyterm(series_id: str, term_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    term = KeytermModel.find_by_id(term_id)
    if not term or term.get('series_id') != series_id:
        return jsonify({'error': 'Keyterm not found'}), 404

    ok = meeting_glossary.reject_term(term_id)
    if not ok:
        return jsonify({'error': 'Failed to delete keyterm'}), 500

    return jsonify({'message': 'Keyterm deleted'}), 200


# ---------------------------------------------------------------------------
# GET /<series_id>/speaker-names
# ---------------------------------------------------------------------------

@meeting_series_bp.route('/<series_id>/speaker-names', methods=['GET'])
@jwt_required()
@active_user_required
@feature_required('meetings')
def list_speaker_names(series_id: str):
    user = get_current_user()
    user_id = str(user['_id'])
    series, err = _owned_series_or_404(series_id, user_id)
    if err:
        return err

    rows = SpeakerNameModel.list_for_series(series_id)
    return jsonify({'speaker_names': [_serialize(r) for r in rows]}), 200
