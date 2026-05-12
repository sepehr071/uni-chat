"""Tests for app/routes/automate_agent.py (CRUD, non-stream)."""

from unittest.mock import patch

import pytest
from bson import ObjectId

from app.models.automate_message import AutomateMessageModel
from app.models.automate_task import AutomateTaskModel


def _mk_task(uid, status='pending'):
    tid = AutomateTaskModel.create(str(uid), 'go do X', 'gpt-4')
    if status != 'pending':
        AutomateTaskModel.set_status(tid, status)
    return AutomateTaskModel.find_by_id(tid)


class TestList:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/automate-agent/tasks', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 0

    def test_populated(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            _mk_task(test_user['_id'])
            _mk_task(test_user['_id'])
        r = client.get('/api/automate-agent/tasks', headers=auth_headers)
        assert r.get_json()['total'] == 2


class TestGet:
    def test_not_found(self, client, auth_headers):
        r = client.get(f'/api/automate-agent/tasks/{ObjectId()}',
                       headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            task = _mk_task(ObjectId())
        r = client.get(f"/api/automate-agent/tasks/{task['_id']}",
                       headers=auth_headers)
        assert r.status_code == 403

    def test_success_with_messages(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
            AutomateMessageModel.create(
                task_id=str(task['_id']),
                cursor_id='c-1',
                role='agent',
                type='thinking',
                summary='thinking',
                data=None,
                screenshot_url=None,
            )
        r = client.get(f"/api/automate-agent/tasks/{task['_id']}",
                       headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert len(body['messages']) == 1


class TestDelete:
    def test_not_found(self, client, auth_headers):
        r = client.delete(f'/api/automate-agent/tasks/{ObjectId()}',
                          headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            task = _mk_task(ObjectId())
        r = client.delete(f"/api/automate-agent/tasks/{task['_id']}",
                          headers=auth_headers)
        assert r.status_code == 403

    def test_terminal_task_no_stop_call(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'], status='completed')
        with patch('app.routes.automate_agent.BrowserUseService.stop_session') as m:
            r = client.delete(f"/api/automate-agent/tasks/{task['_id']}",
                              headers=auth_headers)
        assert r.status_code == 200
        m.assert_not_called()

    def test_active_task_calls_stop(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
            AutomateTaskModel.set_session(task['_id'], 'sess-1', 'https://x/y')
        with patch('app.routes.automate_agent.BrowserUseService.stop_session') as m:
            r = client.delete(f"/api/automate-agent/tasks/{task['_id']}",
                              headers=auth_headers)
        assert r.status_code == 200
        m.assert_called_once()

    def test_stop_session_error_swallowed(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
            AutomateTaskModel.set_session(task['_id'], 'sess-1', None)
        with patch('app.routes.automate_agent.BrowserUseService.stop_session',
                   side_effect=RuntimeError('boom')):
            r = client.delete(f"/api/automate-agent/tasks/{task['_id']}",
                              headers=auth_headers)
        assert r.status_code == 200


class TestStop:
    def test_not_found(self, client, auth_headers):
        r = client.post(f'/api/automate-agent/tasks/{ObjectId()}/stop',
                        headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            task = _mk_task(ObjectId())
        r = client.post(f"/api/automate-agent/tasks/{task['_id']}/stop",
                        headers=auth_headers)
        assert r.status_code == 403

    def test_terminal_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'], status='completed')
        r = client.post(f"/api/automate-agent/tasks/{task['_id']}/stop",
                        headers=auth_headers)
        assert r.status_code == 400

    def test_no_session_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
        r = client.post(f"/api/automate-agent/tasks/{task['_id']}/stop",
                        headers=auth_headers)
        assert r.status_code == 400

    def test_stop_session_error_502(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
            AutomateTaskModel.set_session(task['_id'], 'sess-1', None)
        with patch('app.routes.automate_agent.BrowserUseService.stop_session',
                   side_effect=RuntimeError('boom')):
            r = client.post(f"/api/automate-agent/tasks/{task['_id']}/stop",
                            headers=auth_headers)
        assert r.status_code == 502

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            task = _mk_task(test_user['_id'])
            AutomateTaskModel.set_session(task['_id'], 'sess-1', None)
        with patch('app.routes.automate_agent.BrowserUseService.stop_session'):
            r = client.post(f"/api/automate-agent/tasks/{task['_id']}/stop",
                            headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['status'] == 'stopped'
