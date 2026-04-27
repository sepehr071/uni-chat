from datetime import datetime, timedelta
from bot.services.ratelimit import allow_request, RATE_PER_MINUTE


def make_user(window_start=None, count=0):
    return {'_id': 'u1', 'telegram_rate_limit': {'window_start': window_start, 'count': count}}


def test_first_request_allowed():
    user = {'_id': 'u1'}
    ok, new_state = allow_request(user, now=datetime.utcnow())
    assert ok is True
    assert new_state['count'] == 1


def test_within_window_increments():
    now = datetime.utcnow()
    user = make_user(window_start=now, count=5)
    ok, new_state = allow_request(user, now=now)
    assert ok is True
    assert new_state['count'] == 6


def test_window_resets_after_60s():
    now = datetime.utcnow()
    user = make_user(window_start=now - timedelta(seconds=61), count=RATE_PER_MINUTE)
    ok, new_state = allow_request(user, now=now)
    assert ok is True
    assert new_state['count'] == 1


def test_exceeded_blocked():
    now = datetime.utcnow()
    user = make_user(window_start=now, count=RATE_PER_MINUTE)
    ok, _ = allow_request(user, now=now)
    assert ok is False
