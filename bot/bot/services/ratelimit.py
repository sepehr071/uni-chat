"""Sliding-window rate limiter that lives inside users.telegram_rate_limit."""
from datetime import datetime, timedelta

RATE_PER_MINUTE = 20
WINDOW_SECONDS = 60


def allow_request(user: dict, now: datetime | None = None) -> tuple[bool, dict]:
    """
    Returns (allowed, new_state). Caller is responsible for persisting new_state to MongoDB.
    """
    now = now or datetime.utcnow()
    state = user.get('telegram_rate_limit') or {}
    window_start = state.get('window_start')
    count = state.get('count', 0)

    if not window_start or now - window_start > timedelta(seconds=WINDOW_SECONDS):
        return True, {'window_start': now, 'count': 1}

    if count >= RATE_PER_MINUTE:
        return False, state

    return True, {'window_start': window_start, 'count': count + 1}
