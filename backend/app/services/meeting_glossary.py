"""
Series glossary — keyterms + speaker-name memory per recurring meeting series.

Backed by two Mongo collections (BA1 model files):
  * ``meeting_series_keyterms`` — ``{_id, series_id, term, source, created_at}``
    unique on ``(series_id, term)``. ``source ∈ {manual, suggested, accepted}``.
    All ``series_id`` values are **UUID4 strings** (NOT ObjectIds) — they
    reference ``meeting_series._id`` which is a UUID4 string. ``_id`` here is
    likewise a UUID4 string.
  * ``meeting_series_speaker_names`` —
    ``{_id, series_id, display_name, last_used_at, created_at}``
    unique on ``(series_id, display_name)``. Same UUID4-string convention.

All upserts are Mongo-native: ``$setOnInsert`` for INSERT-OR-IGNORE semantics
and a paired ``$set`` block for ``last_used_at`` bumps, replacing the upstream
sqlite ``ON CONFLICT DO UPDATE`` flow.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.extensions import mongo

logger = logging.getLogger(__name__)


# Keyterm length / count caps. ``BATCH_*`` apply to async Scribe v2 calls.
# Realtime values are kept for forward-compat (live captions are out-of-scope
# in v1 but the constants live here so glossary callers don't drift).
BATCH_MAX_TERMS = 1000
BATCH_MAX_CHARS = 50
REALTIME_MAX_TERMS = 50
REALTIME_MAX_CHARS = 20
KEYTERM_MAX_WORDS = 5

KEYTERM_SOURCE_MANUAL = 'manual'
KEYTERM_SOURCE_SUGGESTED = 'suggested'
KEYTERM_SOURCE_ACCEPTED = 'accepted'
_VALID_SOURCES = {KEYTERM_SOURCE_MANUAL, KEYTERM_SOURCE_SUGGESTED, KEYTERM_SOURCE_ACCEPTED}


_TOKEN_PUNCT = re.compile(r"[\s،.,;:!?\(\)\[\]\{\}\"'«»\-_/\\|]+")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _keyterms_collection():
    return mongo.db.meeting_series_keyterms


def _speaker_names_collection():
    return mongo.db.meeting_series_speaker_names


def _series_id_str(series_id) -> str | None:
    """Normalise a series id to its stored representation (UUID4 string)."""
    if not series_id:
        return None
    return str(series_id)


def _is_valid_keyterm(term: str, *, max_chars: int) -> bool:
    if not term:
        return False
    term = term.strip()
    if len(term) < 2 or len(term) > max_chars:
        return False
    word_count = len([w for w in _TOKEN_PUNCT.split(term) if w])
    if word_count > KEYTERM_MAX_WORDS:
        return False
    if term.isdigit():
        return False
    return True


def get_active_keyterms(series_id, *, realtime: bool = False) -> list[str]:
    """Return de-duplicated, validated MANUAL+ACCEPTED keyterms for a series.

    ``series_id`` must be a UUID4 string (or stringifiable to one).
    Ordered by insertion time. Capped per ``BATCH_MAX_TERMS`` /
    ``REALTIME_MAX_TERMS``.
    """
    sid = _series_id_str(series_id)
    if not sid:
        return []
    max_terms = REALTIME_MAX_TERMS if realtime else BATCH_MAX_TERMS
    max_chars = REALTIME_MAX_CHARS if realtime else BATCH_MAX_CHARS

    cursor = (
        _keyterms_collection()
        .find({
            'series_id': sid,
            'source': {'$in': [KEYTERM_SOURCE_MANUAL, KEYTERM_SOURCE_ACCEPTED]},
        }, {'term': 1})
        .sort('created_at', 1)
    )

    out: list[str] = []
    seen: set[str] = set()
    for row in cursor:
        term = (row.get('term') or '').strip()
        if term in seen:
            continue
        if not _is_valid_keyterm(term, max_chars=max_chars):
            continue
        seen.add(term)
        out.append(term)
        if len(out) >= max_terms:
            break
    return out


def add_suggested_terms(series_id, terms: list[str]) -> int:
    """Upsert SUGGESTED terms; existing rows are left alone (manual wins).

    Returns count of newly-inserted rows.
    """
    sid = _series_id_str(series_id)
    if not sid or not terms:
        return 0

    col = _keyterms_collection()
    added = 0
    for raw in terms:
        if not raw:
            continue
        term = raw.strip()
        if not _is_valid_keyterm(term, max_chars=BATCH_MAX_CHARS):
            continue
        result = col.update_one(
            {'series_id': sid, 'term': term},
            {
                '$setOnInsert': {
                    '_id': str(uuid.uuid4()),
                    'series_id': sid,
                    'term': term,
                    'source': KEYTERM_SOURCE_SUGGESTED,
                    'created_at': _now(),
                },
            },
            upsert=True,
        )
        # ``upserted_id`` is set only when an insert actually occurred.
        if result.upserted_id is not None:
            added += 1
    return added


def add_manual_term(series_id, term: str) -> dict | None:
    """Insert a MANUAL term, or promote an existing SUGGESTED row to MANUAL.

    Returns the resulting document (with ``_id``) or ``None`` if the term
    failed validation.
    """
    sid = _series_id_str(series_id)
    if not sid:
        return None
    term = (term or '').strip()
    if not _is_valid_keyterm(term, max_chars=BATCH_MAX_CHARS):
        return None

    col = _keyterms_collection()
    existing = col.find_one({'series_id': sid, 'term': term})
    if existing is not None:
        if existing.get('source') != KEYTERM_SOURCE_MANUAL:
            col.update_one(
                {'_id': existing['_id']},
                {'$set': {'source': KEYTERM_SOURCE_MANUAL}},
            )
            existing['source'] = KEYTERM_SOURCE_MANUAL
        return existing

    doc = {
        '_id': str(uuid.uuid4()),
        'series_id': sid,
        'term': term,
        'source': KEYTERM_SOURCE_MANUAL,
        'created_at': _now(),
    }
    col.insert_one(doc)
    return doc


def accept_term(term_id) -> bool:
    """Promote SUGGESTED → ACCEPTED. Returns True on match."""
    if not term_id:
        return False
    result = _keyterms_collection().update_one(
        {'_id': str(term_id)},
        {'$set': {'source': KEYTERM_SOURCE_ACCEPTED}},
    )
    return result.matched_count > 0


def reject_term(term_id) -> bool:
    """Reject = delete row. Returns True if a row was removed."""
    if not term_id:
        return False
    result = _keyterms_collection().delete_one({'_id': str(term_id)})
    return result.deleted_count > 0


def list_keyterms(series_id, source: str | None = None) -> list[dict]:
    """Return all keyterms for a series, optionally filtered by source.

    Ordered by ``created_at`` ascending.
    """
    sid = _series_id_str(series_id)
    if not sid:
        return []
    query: dict = {'series_id': sid}
    if source:
        if source not in _VALID_SOURCES:
            return []
        query['source'] = source
    return list(_keyterms_collection().find(query).sort('created_at', 1))


def old_tokens_present(text: str | None) -> bool:
    return bool(text and text.strip())


def _filter_tokens(tokens: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        clean = tok.strip()
        if clean in seen:
            continue
        if not _is_valid_keyterm(clean, max_chars=BATCH_MAX_CHARS):
            continue
        seen.add(clean)
        out.append(clean)
    return out


def extract_correction_diffs(old_text: str | None, new_text: str | None) -> list[str]:
    """Return new tokens present in ``new_text`` but not in ``old_text``.

    Kept for forward-compat with live-caption corrections; v1 callers only
    use it indirectly via the suggested-terms pipeline.
    """
    if not new_text:
        return []
    new_tokens = [t for t in _TOKEN_PUNCT.split(new_text) if t]
    if not old_tokens_present(old_text):
        return _filter_tokens(new_tokens)
    old_set = {t for t in _TOKEN_PUNCT.split(old_text or '') if t}
    fresh = [t for t in new_tokens if t not in old_set]
    return _filter_tokens(fresh)


def upsert_speaker_name(series_id, display_name: str) -> None:
    """Insert-or-bump a speaker name in this series' memory.

    On insert: writes ``series_id``, ``display_name``, ``last_used_at=now``,
    ``created_at=now``, plus a fresh UUID4 ``_id``.
    On match: bumps ``last_used_at`` to now (and leaves the other fields).
    """
    sid = _series_id_str(series_id)
    if not sid:
        return
    name = (display_name or '').strip()
    if not name:
        return
    now = _now()
    _speaker_names_collection().update_one(
        {'series_id': sid, 'display_name': name},
        {
            '$set': {'last_used_at': now},
            '$setOnInsert': {
                '_id': str(uuid.uuid4()),
                'series_id': sid,
                'display_name': name,
                'created_at': now,
            },
        },
        upsert=True,
    )


def list_speaker_names(series_id) -> list[str]:
    """Recent display names for this series, newest-first."""
    sid = _series_id_str(series_id)
    if not sid:
        return []
    cursor = (
        _speaker_names_collection()
        .find({'series_id': sid}, {'display_name': 1})
        .sort('last_used_at', -1)
    )
    return [row.get('display_name', '') for row in cursor if row.get('display_name')]
