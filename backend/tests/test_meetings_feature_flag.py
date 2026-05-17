"""
Feature-flag gating — when ``platform_settings.features.meetings == False``,
every meetings + meeting-series route returns 404 (the ``feature_required``
decorator hides the route as if it doesn't exist).
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def disable_meetings_feature(app, db):
    """See ``test_meetings_routes.py`` for the title_text drop rationale."""
    from app.models.platform_settings import PlatformSettingsModel, SINGLETON_ID
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {'$set': {'features.meetings': False}, '$setOnInsert': {'_id': SINGLETON_ID}},
            upsert=True,
        )
        from app.models.meeting import MeetingModel
        col = MeetingModel.get_collection()
        try:
            if 'title_text' in col.index_information():
                col.drop_index('title_text')
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Spot-check a handful of representative endpoints across both blueprints.
# Exhaustive coverage isn't needed — the decorator is the same on every route.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('method,path', [
    ('GET', '/api/meetings/list'),
    ('GET', '/api/meetings/suggest-series?title=anything'),
    ('GET', '/api/meeting-series/list'),
])
def test_get_routes_return_404_when_flag_off(app, db, client, auth_headers, method, path):
    r = client.open(path, method=method, headers=auth_headers)
    assert r.status_code == 404
    body = r.get_json() or {}
    assert body.get('error') == 'feature_disabled'
    assert body.get('feature') == 'meetings'


def test_create_series_404_when_flag_off(app, db, client, auth_headers):
    r = client.post(
        '/api/meeting-series/create',
        json={'name': 'Weekly'},
        headers=auth_headers,
    )
    assert r.status_code == 404
    body = r.get_json() or {}
    assert body.get('error') == 'feature_disabled'


def test_get_specific_meeting_404_when_flag_off(app, db, client, test_user, auth_headers):
    # Create a meeting directly via model — bypass the gated upload route.
    from app.models.meeting import MeetingModel
    with app.app_context():
        mid = MeetingModel.create(str(test_user['_id']), {
            'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
        })
    r = client.get(f'/api/meetings/{mid}', headers=auth_headers)
    # The feature_required decorator fires BEFORE the in-handler 404
    # check, so we expect the feature_disabled 404 (not the meeting 404).
    assert r.status_code == 404
    body = r.get_json() or {}
    assert body.get('error') == 'feature_disabled'
