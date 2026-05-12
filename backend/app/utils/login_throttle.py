"""
Login throttle (P0.3).

Bounds credential-stuffing attacks by counting failed login attempts per
(ip, email) tuple over a 15-minute sliding window. Implementation: a Mongo
TTL collection ``login_attempt_log`` with a TTL index on ``at`` so old
attempts auto-expire after 15 minutes. After 5 fails in the window the
login route returns HTTP 429 with a ``Retry-After`` header.

Why Mongo and not Redis: Redis is not part of the prod stack today and
correctness here only needs eventual consistency (a multi-worker race
that lets a 6th attempt through is acceptable; a worker-local in-memory
counter that gets reset on restart is not).

Why no captcha: out of scope per audit anchor — captcha integration would
require frontend + provider work, and the throttle alone closes the
unbounded-attempt hole.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from app.extensions import mongo

_COLLECTION = 'login_attempt_log'
_WINDOW_SECONDS = 15 * 60  # 15 minutes
_MAX_ATTEMPTS = 5

# TTL index is created lazily on first call. Module-level flag avoids
# repeated create_index() round trips after the first request.
_INDEX_ENSURED = False


def _ensure_index() -> None:
    """Create the TTL index on ``at`` if it doesn't already exist.

    Lazy and idempotent. ``create_index`` is a no-op when the index with
    the same key+options already exists. We keep this out of the boot-time
    index setup loop because login_throttle is an internal helper that
    not every deployment will use.
    """
    global _INDEX_ENSURED
    if _INDEX_ENSURED:
        return
    try:
        mongo.db[_COLLECTION].create_index(
            'at',
            expireAfterSeconds=_WINDOW_SECONDS,
            name='login_attempt_ttl',
        )
        _INDEX_ENSURED = True
    except Exception:
        # Best-effort. If Mongo is briefly down at request time we'd
        # rather let the login attempt through than 500.
        pass


def _normalize_email(email: str) -> str:
    return (email or '').strip().lower()


def record_failure(ip: str, email: str) -> None:
    """Log a single failed-login attempt for the (ip, email) pair."""
    _ensure_index()
    try:
        mongo.db[_COLLECTION].insert_one({
            'ip': (ip or '').strip(),
            'email': _normalize_email(email),
            'at': datetime.utcnow(),
        })
    except Exception:
        # Same fail-open posture: don't 500 a real login just because the
        # throttle log write hiccuped.
        pass


def count_recent_failures(ip: str, email: str) -> int:
    """Return the number of failed attempts for (ip, email) inside the
    current 15-minute window.

    Uses an explicit ``at >= now - window`` filter rather than relying
    solely on the TTL — Mongo's TTL monitor runs at minute granularity so
    a row may stick around briefly after its lifetime expires.
    """
    _ensure_index()
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=_WINDOW_SECONDS)
        return mongo.db[_COLLECTION].count_documents({
            'ip': (ip or '').strip(),
            'email': _normalize_email(email),
            'at': {'$gte': cutoff},
        })
    except Exception:
        return 0


def is_blocked(ip: str, email: str) -> bool:
    """Return True when the (ip, email) pair has hit the failure cap."""
    return count_recent_failures(ip, email) >= _MAX_ATTEMPTS


def retry_after_seconds() -> int:
    """Conservative ``Retry-After`` header value (full window length).

    A smarter implementation could compute the timestamp of the oldest
    failure in the window and return the remaining seconds, but returning
    the full window is correct (clients will be cleared after at most
    that long) and avoids an extra Mongo round-trip.
    """
    return _WINDOW_SECONDS


def clear_for_email(email: str) -> None:
    """Wipe all logged attempts for ``email`` (called after a successful
    login so the legit user isn't blocked by stale failures on the same
    box)."""
    try:
        mongo.db[_COLLECTION].delete_many({'email': _normalize_email(email)})
    except Exception:
        pass
