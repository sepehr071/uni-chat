"""
Cross-worker stream-generation state (P0.2).

The chat/arena/debate SSE endpoints used to track in-flight generations via
process-global dicts (``active_generations`` etc.). Under multi-worker
gunicorn the cancel POST often lands on a *different* worker than the
streaming generator, so the dict lookup failed and cancel was a no-op.

This module persists the cancel flag in Mongo (collection
``stream_generation_state``) so any worker can see it. A 5-minute TTL on
``expires_at`` auto-reaps abandoned rows. Callers may still keep a
per-process dict as a fast read-through cache; the *authoritative* state
lives in Mongo.

API:
    register(session_id, ttl_seconds=300, user_id=None) -> None
    mark_cancelled(session_id) -> bool
    is_cancelled(session_id) -> bool
    clear(session_id) -> None
    owner_of(session_id) -> Optional[str]   # for cancel-endpoint authz
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.extensions import mongo

_COLLECTION = 'stream_generation_state'
_INDEX_ENSURED = False


def _ensure_index() -> None:
    global _INDEX_ENSURED
    if _INDEX_ENSURED:
        return
    try:
        mongo.db[_COLLECTION].create_index(
            'expires_at',
            expireAfterSeconds=0,
            name='stream_state_ttl',
        )
        mongo.db[_COLLECTION].create_index(
            'session_id',
            unique=True,
            name='stream_state_session_id',
        )
        _INDEX_ENSURED = True
    except Exception:
        # Fail-open: we'd rather the stream proceed than 500 on index race.
        pass


def register(session_id: str, ttl_seconds: int = 300, user_id: Optional[str] = None) -> None:
    """Mark a session as active. Resets ``cancelled`` to False on re-register."""
    _ensure_index()
    now = datetime.now(timezone.utc)
    try:
        mongo.db[_COLLECTION].update_one(
            {'session_id': str(session_id)},
            {'$set': {
                'session_id': str(session_id),
                'cancelled': False,
                'user_id': str(user_id) if user_id else None,
                'created_at': now,
                'expires_at': now + timedelta(seconds=ttl_seconds),
            }},
            upsert=True,
        )
    except Exception:
        pass


def mark_cancelled(session_id: str) -> bool:
    """Set ``cancelled=True`` for the session. Returns True if a doc matched."""
    _ensure_index()
    try:
        res = mongo.db[_COLLECTION].update_one(
            {'session_id': str(session_id)},
            {'$set': {'cancelled': True}},
        )
        return res.matched_count > 0
    except Exception:
        return False


def is_cancelled(session_id: str) -> bool:
    """Read the cancelled flag. Returns False if the row is missing."""
    _ensure_index()
    try:
        doc = mongo.db[_COLLECTION].find_one(
            {'session_id': str(session_id)},
            {'cancelled': 1},
        )
        return bool(doc and doc.get('cancelled'))
    except Exception:
        return False


def clear(session_id: str) -> None:
    """Remove the row. Safe to call in a finally block."""
    try:
        mongo.db[_COLLECTION].delete_one({'session_id': str(session_id)})
    except Exception:
        pass


def owner_of(session_id: str) -> Optional[str]:
    """Return the ``user_id`` that registered the session, or None."""
    try:
        doc = mongo.db[_COLLECTION].find_one(
            {'session_id': str(session_id)},
            {'user_id': 1},
        )
        return doc.get('user_id') if doc else None
    except Exception:
        return None
