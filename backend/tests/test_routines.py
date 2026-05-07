"""
Tests for Routines — model CRUD, per-user limit, run-history cap,
scheduler-client resilience, cron validation, and compute_next_run_at.
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
from bson import ObjectId


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def routine_payload():
    return {
        'name': 'Daily news brief',
        'description': 'Morning AI summary',
        'enabled': True,
        'schedule': {
            'kind': 'cron',
            'cron_expr': '0 9 * * *',
            'cron_source': 'preset',
            'natural_input': None,
            'run_at': None,
            'timezone': 'UTC',
        },
        'action': {
            'kind': 'chat',
            'prompt': 'Give me a news brief',
            'config_id': 'quick:google/gemini-3-flash-preview',
        },
        'outputs': {
            'chat': {'enabled': True, 'conversation_id': None},
            'knowledge': {'enabled': False, 'folder_id': None},
            'telegram': {'enabled': False},
        },
    }


# ---------------------------------------------------------------------------
# RoutineModel CRUD
# ---------------------------------------------------------------------------

class TestRoutineModelCRUD:
    def test_create_and_find(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            user_id = str(test_user['_id'])
            routine_id = RoutineModel.create(user_id, dict(routine_payload))
            assert routine_id

            doc = RoutineModel.find_by_id(routine_id)
            assert doc is not None
            assert doc['name'] == 'Daily news brief'
            assert str(doc['user_id']) == user_id

    def test_find_by_user_returns_own_docs(self, app, db, test_user, admin_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            other_uid = str(admin_user['_id'])
            RoutineModel.create(uid, dict(routine_payload))
            RoutineModel.create(uid, dict(routine_payload, name='Second'))
            RoutineModel.create(other_uid, dict(routine_payload, name='Other user'))

            results = RoutineModel.find_by_user(uid)
            assert len(results) == 2
            assert all(str(r['user_id']) == uid for r in results)

    def test_update(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            rid = RoutineModel.create(uid, dict(routine_payload))
            matched = RoutineModel.update(rid, uid, {'name': 'Updated name'})
            assert matched
            doc = RoutineModel.find_by_id(rid)
            assert doc['name'] == 'Updated name'

    def test_update_wrong_user_fails(self, app, db, test_user, admin_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            other_uid = str(admin_user['_id'])
            rid = RoutineModel.create(uid, dict(routine_payload))
            matched = RoutineModel.update(rid, other_uid, {'name': 'Hacked'})
            assert not matched

    def test_delete(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            rid = RoutineModel.create(uid, dict(routine_payload))
            deleted = RoutineModel.delete(rid, uid)
            assert deleted
            assert RoutineModel.find_by_id(rid) is None

    def test_set_enabled(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            rid = RoutineModel.create(uid, dict(routine_payload))
            RoutineModel.set_enabled(rid, uid, False)
            doc = RoutineModel.find_by_id(rid)
            assert doc['enabled'] is False

    def test_count_active_for_user(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            rid1 = RoutineModel.create(uid, dict(routine_payload))
            rid2 = RoutineModel.create(uid, dict(routine_payload, name='Second'))
            RoutineModel.set_enabled(rid2, uid, False)

            count = RoutineModel.count_active_for_user(uid)
            assert count == 1  # only rid1 is enabled


# ---------------------------------------------------------------------------
# Per-user limit enforcement via route
# ---------------------------------------------------------------------------

class TestPerUserLimit:
    def test_create_beyond_limit_returns_400(self, app, db, test_user, auth_headers, client, routine_payload):
        from app.models.routine import RoutineModel, MAX_ROUTINES_PER_USER

        with app.app_context():
            uid = str(test_user['_id'])
            # Create MAX_ROUTINES_PER_USER routines directly
            for i in range(MAX_ROUTINES_PER_USER):
                RoutineModel.create(uid, dict(routine_payload, name=f'Routine {i}'))

            # One more via API should be rejected
            r = client.post(
                '/api/routines/create',
                json=routine_payload,
                headers=auth_headers,
            )
            assert r.status_code == 400
            body = r.get_json()
            assert 'limit' in body.get('error', '').lower() or 'limit' in str(body).lower()

    def test_admin_bypasses_limit(self, app, db, admin_user, admin_headers, client, routine_payload):
        from app.models.routine import RoutineModel, MAX_ROUTINES_PER_USER

        with app.app_context():
            uid = str(admin_user['_id'])
            for i in range(MAX_ROUTINES_PER_USER):
                RoutineModel.create(uid, dict(routine_payload, name=f'Routine {i}'))

            r = client.post(
                '/api/routines/create',
                json=routine_payload,
                headers=admin_headers,
            )
            assert r.status_code == 201


# ---------------------------------------------------------------------------
# RoutineRunModel
# ---------------------------------------------------------------------------

class TestRoutineRunModel:
    def _create_routine(self, app, test_user, routine_payload):
        from app.models.routine import RoutineModel
        return RoutineModel.create(str(test_user['_id']), dict(routine_payload))

    def test_start_returns_id(self, app, db, test_user, routine_payload):
        from app.models.routine_run import RoutineRunModel

        with app.app_context():
            rid = self._create_routine(app, test_user, routine_payload)
            uid = str(test_user['_id'])
            run_id = RoutineRunModel.start(rid, uid)
            assert run_id is not None

    def test_start_skips_if_already_running(self, app, db, test_user, routine_payload):
        from app.models.routine_run import RoutineRunModel

        with app.app_context():
            rid = self._create_routine(app, test_user, routine_payload)
            uid = str(test_user['_id'])
            run_id_1 = RoutineRunModel.start(rid, uid)
            assert run_id_1 is not None
            run_id_2 = RoutineRunModel.start(rid, uid)
            assert run_id_2 is None  # skipped

    def test_complete(self, app, db, test_user, routine_payload):
        from app.models.routine_run import RoutineRunModel

        with app.app_context():
            rid = self._create_routine(app, test_user, routine_payload)
            uid = str(test_user['_id'])
            run_id = RoutineRunModel.start(rid, uid)
            RoutineRunModel.complete(run_id, 'success', result_text='Done', delivered_to=['chat'])
            runs = RoutineRunModel.find_by_routine(rid)
            assert runs[0]['status'] == 'success'
            assert runs[0]['result_text'] == 'Done'

    def test_fail(self, app, db, test_user, routine_payload):
        from app.models.routine_run import RoutineRunModel

        with app.app_context():
            rid = self._create_routine(app, test_user, routine_payload)
            uid = str(test_user['_id'])
            run_id = RoutineRunModel.start(rid, uid)
            RoutineRunModel.fail(run_id, 'Something broke', traceback='tb text', retry_count=1)
            runs = RoutineRunModel.find_by_routine(rid)
            assert runs[0]['status'] == 'failed'
            assert runs[0]['error']['message'] == 'Something broke'
            assert runs[0]['retry_count'] == 1

    def test_purge_to_50(self, app, db, test_user, routine_payload):
        from app.models.routine_run import RoutineRunModel

        with app.app_context():
            rid = self._create_routine(app, test_user, routine_payload)
            uid = str(test_user['_id'])

            # Insert 60 runs with distinct started_at
            col = RoutineRunModel.get_collection()
            for i in range(60):
                col.insert_one({
                    'routine_id': ObjectId(rid),
                    'user_id': ObjectId(uid),
                    'started_at': datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=i),
                    'finished_at': None,
                    'status': 'success',
                    'result_text': None,
                    'result_meta': None,
                    'delivered_to': [],
                    'error': None,
                    'retry_count': 0,
                })

            total_before = col.count_documents({'routine_id': ObjectId(rid)})
            assert total_before == 60

            RoutineRunModel.purge_to_50(rid)

            total_after = col.count_documents({'routine_id': ObjectId(rid)})
            assert total_after == 50


# ---------------------------------------------------------------------------
# Scheduler client — swallows connection errors
# ---------------------------------------------------------------------------

class TestSchedulerClient:
    def test_notify_swallows_connection_error(self):
        from app.utils import scheduler_client
        import requests

        with patch.object(requests, 'post', side_effect=requests.exceptions.ConnectionError('refused')):
            # Must not raise
            scheduler_client.notify('abc123', 'upsert')

    def test_run_now_swallows_timeout(self):
        from app.utils import scheduler_client
        import requests

        with patch.object(requests, 'post', side_effect=requests.exceptions.Timeout('timed out')):
            scheduler_client.run_now('abc123')


# ---------------------------------------------------------------------------
# Cron preset validation
# ---------------------------------------------------------------------------

class TestCronPresets:
    def test_valid_cron(self):
        from app.utils.cron_presets import validate_cron
        assert validate_cron('0 9 * * *') is True
        assert validate_cron('*/5 * * * *') is True
        assert validate_cron('0 9 * * 1-5') is True

    def test_invalid_cron(self):
        from app.utils.cron_presets import validate_cron
        assert validate_cron('') is False
        assert validate_cron('not a cron') is False
        assert validate_cron('0 9 * *') is False      # only 4 fields
        assert validate_cron('99 9 * * *') is False    # minute out of range

    def test_cron_to_label_known(self):
        from app.utils.cron_presets import cron_to_label
        assert cron_to_label('0 9 * * *') == 'Daily 9 AM'
        assert cron_to_label('0 * * * *') == 'Every hour'

    def test_cron_to_label_unknown(self):
        from app.utils.cron_presets import cron_to_label
        assert cron_to_label('*/7 * * * *') is None


# ---------------------------------------------------------------------------
# compute_next_run_at correctness (including across DST)
# ---------------------------------------------------------------------------

class TestComputeNextRunAt:
    def test_returns_utc_aware_datetime(self, app, db):
        from app.models.routine import RoutineModel

        with app.app_context():
            dt = RoutineModel.compute_next_run_at('0 9 * * *', 'UTC')
            assert dt is not None
            assert dt.tzinfo is not None
            assert dt.hour == 9  # 9 AM UTC → 9 AM UTC

    def test_tz_offset_applied(self, app, db):
        from app.models.routine import RoutineModel

        with app.app_context():
            # 9 AM America/New_York = UTC-4 (EDT) or UTC-5 (EST)
            dt = RoutineModel.compute_next_run_at('0 9 * * *', 'America/New_York')
            assert dt is not None
            # UTC hour should be 13 (EDT) or 14 (EST)
            assert dt.hour in (13, 14)

    def test_invalid_cron_returns_none(self, app, db):
        from app.models.routine import RoutineModel

        with app.app_context():
            dt = RoutineModel.compute_next_run_at('not a cron', 'UTC')
            assert dt is None

    def test_invalid_tz_returns_none(self, app, db):
        from app.models.routine import RoutineModel

        with app.app_context():
            dt = RoutineModel.compute_next_run_at('0 9 * * *', 'Invalid/Zone')
            assert dt is None


# ---------------------------------------------------------------------------
# Route-level auth / ownership checks
# ---------------------------------------------------------------------------

class TestRoutineRoutes:
    def test_list_requires_jwt(self, client):
        assert client.get('/api/routines/list').status_code == 401

    def test_create_requires_jwt(self, client):
        assert client.post('/api/routines/create', json={}).status_code == 401

    def test_create_validates_body(self, client, auth_headers):
        r = client.post('/api/routines/create', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_create_success(self, client, auth_headers, db, routine_payload):
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
        assert r.status_code == 201
        body = r.get_json()
        assert 'routine' in body
        assert body['routine']['name'] == 'Daily news brief'

    def test_get_routine(self, client, auth_headers, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
        rid = r.get_json()['routine']['_id']

        r2 = client.get(f'/api/routines/{rid}', headers=auth_headers)
        assert r2.status_code == 200

    def test_delete_routine(self, client, auth_headers, db, routine_payload):
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
            rid = r.get_json()['routine']['_id']
            r2 = client.delete(f'/api/routines/{rid}', headers=auth_headers)
        assert r2.status_code == 200

    def test_toggle_routine(self, client, auth_headers, db, routine_payload):
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
            rid = r.get_json()['routine']['_id']
            r2 = client.post(f'/api/routines/{rid}/toggle', headers=auth_headers)
        assert r2.status_code == 200
        body = r2.get_json()
        # Was enabled=True, toggled → False
        assert body['routine']['enabled'] is False

    def test_run_now_sends_to_scheduler(self, client, auth_headers, db, routine_payload):
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
            rid = r.get_json()['routine']['_id']

        with patch('app.utils.scheduler_client.run_now') as mock_run:
            r2 = client.post(f'/api/routines/{rid}/run-now', headers=auth_headers)

        assert r2.status_code == 202
        mock_run.assert_called_once_with(rid)

    def test_get_runs(self, client, auth_headers, db, routine_payload):
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=auth_headers)
            rid = r.get_json()['routine']['_id']

        r2 = client.get(f'/api/routines/{rid}/runs', headers=auth_headers)
        assert r2.status_code == 200
        assert 'runs' in r2.get_json()

    def test_other_user_cannot_access(self, app, client, db, test_user, admin_user, admin_headers, routine_payload):
        # Create a routine as test_user via direct model call
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            rid = RoutineModel.create(uid, dict(routine_payload))

        # admin_user tries to read it
        r = client.get(f'/api/routines/{rid}', headers=admin_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Project-scoped routine tests (appended -- existing classes unmodified)
# ---------------------------------------------------------------------------

def _make_user_and_headers(app, email, display_name='User'):
    from app.models.user import UserModel
    from flask_jwt_extended import create_access_token
    with app.app_context():
        user = UserModel.create(email=email, password='Pw123!@#', display_name=display_name,
                                role='manager')
        tok = create_access_token(identity=str(user['_id']))
    headers = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}
    return user, headers


def _make_project_for_user(app, client, user_headers, ws_name='WS', proj_name='Proj'):
    """Create a team workspace + project, return (ws_dict, proj_dict)."""
    r_ws = client.post('/api/workspaces/create', json={'name': ws_name}, headers=user_headers)
    assert r_ws.status_code == 201
    ws = r_ws.get_json()
    r_proj = client.post(
        '/api/projects/create',
        json={'workspace_id': ws['_id'], 'name': proj_name},
        headers=user_headers,
    )
    assert r_proj.status_code == 201
    return ws, r_proj.get_json()


class TestRoutineProjectScope:
    def test_create_routine_with_project_id_requires_access(
        self, app, db, client, routine_payload
    ):
        # User has no project membership
        user, headers = _make_user_and_headers(app, 'rps1@example.com', 'RPS1')
        # Create a project owned by a different user
        owner, owner_headers = _make_user_and_headers(app, 'rps1_owner@example.com', 'Owner')
        _, proj = _make_project_for_user(app, client, owner_headers, 'WS RPS1', 'Proj RPS1')
        pid = proj['_id']

        payload = dict(routine_payload, project_id=pid)
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=payload, headers=headers)
        assert r.status_code == 403
        body = r.get_json()
        assert body.get('code') == 'project_access_denied'

    def test_create_routine_with_project_id_owner_access(
        self, app, db, client, routine_payload
    ):
        user, headers = _make_user_and_headers(app, 'rps2@example.com', 'RPS2')
        _, proj = _make_project_for_user(app, client, headers, 'WS RPS2', 'Proj RPS2')
        pid = proj['_id']

        payload = dict(routine_payload, project_id=pid)
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=payload, headers=headers)
        assert r.status_code == 201
        body = r.get_json()
        assert body['routine']['project_id'] == pid

    def test_list_filters_by_project_id_param(self, app, db, client, routine_payload):
        user, headers = _make_user_and_headers(app, 'rps3@example.com', 'RPS3')
        _, proj = _make_project_for_user(app, client, headers, 'WS RPS3', 'Proj RPS3')
        pid = proj['_id']

        with patch('app.utils.scheduler_client.notify'):
            # Personal routine (no project_id)
            r1 = client.post('/api/routines/create', json=dict(routine_payload, name='Personal R'), headers=headers)
            assert r1.status_code == 201

            # Project routine
            r2 = client.post('/api/routines/create', json=dict(routine_payload, name='Project R', project_id=pid), headers=headers)
            assert r2.status_code == 201

        # __personal__ sentinel -> only personal
        r_personal = client.get('/api/routines/list?project_id=__personal__', headers=headers)
        assert r_personal.status_code == 200
        personal_names = [r['name'] for r in r_personal.get_json()['routines']]
        assert 'Personal R' in personal_names
        assert 'Project R' not in personal_names

        # hex project_id -> only project routines
        r_proj = client.get(f'/api/routines/list?project_id={pid}', headers=headers)
        assert r_proj.status_code == 200
        proj_names = [r['name'] for r in r_proj.get_json()['routines']]
        assert 'Project R' in proj_names
        assert 'Personal R' not in proj_names

    def test_list_invalid_project_id_returns_400(self, app, db, client):
        user, headers = _make_user_and_headers(app, 'rps4@example.com', 'RPS4')
        r = client.get('/api/routines/list?project_id=not-hex', headers=headers)
        assert r.status_code == 400

    def test_update_revalidates_project_access_when_changed(
        self, app, db, client, routine_payload
    ):
        user, headers = _make_user_and_headers(app, 'rps5@example.com', 'RPS5')

        # Create a personal routine first
        with patch('app.utils.scheduler_client.notify'):
            r = client.post('/api/routines/create', json=routine_payload, headers=headers)
        assert r.status_code == 201
        rid = r.get_json()['routine']['_id']

        # Create a project owned by another user -- user has no access
        owner, owner_headers = _make_user_and_headers(app, 'rps5_owner@example.com', 'Owner5')
        _, proj = _make_project_for_user(app, client, owner_headers, 'WS RPS5', 'Proj RPS5')
        foreign_pid = proj['_id']

        update_payload = dict(routine_payload, project_id=foreign_pid)
        with patch('app.utils.scheduler_client.notify'):
            r2 = client.put(f'/api/routines/{rid}', json=update_payload, headers=headers)
        assert r2.status_code == 403
        body = r2.get_json()
        assert body.get('code') == 'project_access_denied'

    def test_find_by_user_and_project_sentinels(self, app, db, test_user, routine_payload):
        from app.models.routine import RoutineModel

        with app.app_context():
            uid = str(test_user['_id'])
            # Personal routine
            RoutineModel.create(uid, dict(routine_payload, name='Personal'))
            # We need a fake project_id (don't need a real project for model test)
            fake_pid = str(ObjectId())
            payload_proj = dict(routine_payload, name='Proj', project_id=fake_pid)
            # Bypass route, set project_id directly in create
            doc = dict(routine_payload, name='Proj')
            from datetime import datetime, timezone
            from app.extensions import mongo
            mongo.db.routines.insert_one({
                'user_id': ObjectId(uid),
                'project_id': ObjectId(fake_pid),
                'name': 'Proj',
                'enabled': True,
                'schedule': doc['schedule'],
                'action': doc['action'],
                'outputs': doc.get('outputs', {}),
                'next_run_at': None,
                'last_run_at': None,
                'last_run_status': None,
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc),
            })

            # '__any__' returns all
            all_routines = RoutineModel.find_by_user_and_project(uid, '__any__')
            assert len(all_routines) == 2

            # None returns only personal (project_id is None)
            personal = RoutineModel.find_by_user_and_project(uid, None)
            assert len(personal) == 1
            assert personal[0]['project_id'] is None

            # hex string returns only that project's routines
            proj_routines = RoutineModel.find_by_user_and_project(uid, fake_pid)
            assert len(proj_routines) == 1
            assert str(proj_routines[0]['project_id']) == fake_pid
