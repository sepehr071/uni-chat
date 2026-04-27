"""Resolve a Telegram user_id to a uni-chat user dict, with a tiny LRU cache."""
import time
from threading import Lock
from typing import Optional
from app.models.user import UserModel
from bot.flask_ctx import flask_app

_CACHE: dict[int, tuple[float, dict]] = {}
_CACHE_TTL = 60.0
_LOCK = Lock()


def resolve_user(telegram_id: int) -> Optional[dict]:
    """Return the uni-chat user dict for this Telegram id, or None if unlinked."""
    now = time.time()
    with _LOCK:
        cached = _CACHE.get(telegram_id)
        if cached and now - cached[0] < _CACHE_TTL:
            return cached[1]

    with flask_app.app_context():
        user = UserModel.find_by_telegram_id(telegram_id)

    with _LOCK:
        _CACHE[telegram_id] = (now, user) if user else (now, None)
    return user


def invalidate(telegram_id: int) -> None:
    with _LOCK:
        _CACHE.pop(telegram_id, None)
