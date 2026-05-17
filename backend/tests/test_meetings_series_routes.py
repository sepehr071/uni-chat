"""
Meeting-series HTTP routes — CRUD, 409 on duplicate name, keyterm operations,
cross-user 404.
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def enable_meetings_feature(app, db):
    """See ``test_meetings_routes.py`` for the title_text drop rationale."""
    from app.models.platform_settings import PlatformSettingsModel, SINGLETON_ID
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {'$set': {'features.meetings': True}, '$setOnInsert': {'_id': SINGLETON_ID}},
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
# Series CRUD
# ---------------------------------------------------------------------------

class TestSeriesCRUD:
    def test_create_series(self, client, auth_headers):
        r = client.post(
            '/api/meeting-series/create',
            json={'name': 'Weekly', 'email_tone': 'formal'},
            headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.get_json()['series']
        assert body['name'] == 'Weekly'
        assert body['email_tone'] == 'formal'

    def test_create_duplicate_name_409(self, client, auth_headers):
        client.post(
            '/api/meeting-series/create', json={'name': 'Weekly'}, headers=auth_headers,
        )
        r = client.post(
            '/api/meeting-series/create', json={'name': 'Weekly'}, headers=auth_headers,
        )
        assert r.status_code == 409

    def test_create_empty_name_400(self, client, auth_headers):
        r = client.post(
            '/api/meeting-series/create', json={'name': ''}, headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_invalid_tone_400(self, client, auth_headers):
        r = client.post(
            '/api/meeting-series/create',
            json={'name': 'X', 'email_tone': 'screaming'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_list(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            MeetingSeriesModel.create(str(test_user['_id']), {'name': 'A'})
            MeetingSeriesModel.create(str(test_user['_id']), {'name': 'B'})
        r = client.get('/api/meeting-series/list', headers=auth_headers)
        assert r.status_code == 200
        series = r.get_json()['series']
        names = {s['name'] for s in series}
        assert {'A', 'B'} <= names
        # meeting_count present on each row
        for s in series:
            assert 'meeting_count' in s

    def test_get_series(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
        r = client.get(f'/api/meeting-series/{sid}', headers=auth_headers)
        assert r.status_code == 200

    def test_get_cross_user_404(self, app, db, client, admin_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(admin_user['_id']), {'name': 'X'})
        r = client.get(f'/api/meeting-series/{sid}', headers=auth_headers)
        assert r.status_code == 404

    def test_patch_renames(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Old'})
        r = client.patch(
            f'/api/meeting-series/{sid}', json={'name': 'New'}, headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['series']['name'] == 'New'

    def test_patch_tone(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
        r = client.patch(
            f'/api/meeting-series/{sid}',
            json={'email_tone': 'casual'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['series']['email_tone'] == 'casual'

    def test_delete_cascades_keyterms_and_unsets_meeting(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MeetingModel
        from app.models.meeting_series import KeytermModel, MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
            meeting_glossary.add_manual_term(sid, 'foobar')
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
                'series_id': sid,
            })
        r = client.delete(f'/api/meeting-series/{sid}', headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            assert MeetingSeriesModel.find_by_id(sid) is None
            assert KeytermModel.list_for_series(sid) == []
            m = MeetingModel.find_by_id(mid)
            assert m['series_id'] is None


# ---------------------------------------------------------------------------
# Keyterm routes
# ---------------------------------------------------------------------------

class TestKeytermRoutes:
    def test_add_keyterm(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
        r = client.post(
            f'/api/meeting-series/{sid}/keyterms',
            json={'term': 'فناوری'},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.get_json()['keyterm']['source'] == 'manual'

    def test_add_invalid_keyterm_400(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
        r = client.post(
            f'/api/meeting-series/{sid}/keyterms',
            json={'term': '12345'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_list_keyterms_filter_by_source(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
            meeting_glossary.add_manual_term(sid, 'alpha')
            meeting_glossary.add_suggested_terms(sid, ['beta'])
        r = client.get(
            f'/api/meeting-series/{sid}/keyterms?source=manual', headers=auth_headers,
        )
        terms = r.get_json()['keyterms']
        assert all(t['source'] == 'manual' for t in terms)

    def test_accept_keyterm(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
            meeting_glossary.add_suggested_terms(sid, ['beta'])
            term_id = meeting_glossary.list_keyterms(sid, source='suggested')[0]['_id']
        r = client.post(
            f'/api/meeting-series/{sid}/keyterms/{term_id}/accept', headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['keyterm']['source'] == 'accepted'

    def test_reject_keyterm(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
            meeting_glossary.add_manual_term(sid, 'alpha')
            term_id = meeting_glossary.list_keyterms(sid, source='manual')[0]['_id']
        r = client.delete(
            f'/api/meeting-series/{sid}/keyterms/{term_id}', headers=auth_headers,
        )
        assert r.status_code == 200
        with app.app_context():
            assert meeting_glossary.list_keyterms(sid, source='manual') == []


class TestSpeakerNameRoute:
    def test_list_speaker_names(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'X'})
            meeting_glossary.upsert_speaker_name(sid, 'Sara')
            meeting_glossary.upsert_speaker_name(sid, 'Ali')
        r = client.get(
            f'/api/meeting-series/{sid}/speaker-names', headers=auth_headers,
        )
        assert r.status_code == 200
        names = [r['display_name'] for r in r.get_json()['speaker_names']]
        assert 'Sara' in names
        assert 'Ali' in names
