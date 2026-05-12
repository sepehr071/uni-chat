"""Tests for app/routes/workflow.py — CRUD + execute + duplicate + runs."""

from unittest.mock import patch

import pytest
from bson import ObjectId

from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel


def _mk_wf(uid, name='WF', project_id=None):
    return WorkflowModel.create(user_id=str(uid), name=name, description='',
                                  nodes=[], edges=[], project_id=project_id)


# ---------------------------------------------------------------------------
# /save
# ---------------------------------------------------------------------------

class TestSave:
    def test_missing_name_400(self, client, auth_headers):
        r = client.post('/api/workflow/save', json={'nodes': []},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_create_basic(self, client, test_user, auth_headers):
        r = client.post('/api/workflow/save', json={
            'name': 'WF', 'nodes': [], 'edges': [],
        }, headers=auth_headers)
        assert r.status_code == 201

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/save', json={
            'name': 'WF', 'project_id': 'bad',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_project_denied_403(self, client, auth_headers):
        r = client.post('/api/workflow/save', json={
            'name': 'WF', 'project_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 403

    def test_update_existing(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        r = client.post('/api/workflow/save', json={
            '_id': str(wf_id), 'name': 'Renamed', 'nodes': [], 'edges': [],
        }, headers=auth_headers)
        assert r.status_code == 200

    def test_update_not_found_404(self, client, auth_headers):
        r = client.post('/api/workflow/save', json={
            '_id': str(ObjectId()), 'name': 'X',
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_update_reject_project_change(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        r = client.post('/api/workflow/save', json={
            '_id': str(wf_id), 'name': 'X', 'project_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 400
        assert r.get_json()['code'] == 'cannot_reassign_project'


# ---------------------------------------------------------------------------
# /list, /<id>, /<id> DELETE, /templates, /duplicate
# ---------------------------------------------------------------------------

class TestListGetDelete:
    def test_list_empty(self, client, test_user, auth_headers):
        r = client.get('/api/workflow/list', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['workflows'] == []

    def test_list_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/workflow/list?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_list_project_denied_403(self, client, auth_headers):
        r = client.get(f'/api/workflow/list?project_id={ObjectId()}',
                       headers=auth_headers)
        assert r.status_code == 403

    def test_get_invalid_id_400(self, client, auth_headers):
        r = client.get('/api/workflow/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_get_not_found(self, client, auth_headers):
        r = client.get(f'/api/workflow/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_get_owned(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        r = client.get(f'/api/workflow/{wf_id}', headers=auth_headers)
        assert r.status_code == 200

    def test_delete_invalid_id_400(self, client, auth_headers):
        r = client.delete('/api/workflow/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_delete_not_found(self, client, auth_headers):
        r = client.delete(f'/api/workflow/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_delete_owned(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        r = client.delete(f'/api/workflow/{wf_id}', headers=auth_headers)
        assert r.status_code == 200

    def test_templates(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            WorkflowModel.create(user_id=str(ObjectId()), name='T',
                                  description='', nodes=[], edges=[],
                                  is_template=True)
        r = client.get('/api/workflow/templates', headers=auth_headers)
        assert r.status_code == 200
        assert len(r.get_json()['templates']) >= 1


class TestDuplicate:
    def test_invalid_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/bad/duplicate', json={},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_not_found(self, client, auth_headers):
        r = client.post(f'/api/workflow/{ObjectId()}/duplicate', json={},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        r = client.post(f'/api/workflow/{wf_id}/duplicate',
                        json={'name': 'Copy'}, headers=auth_headers)
        assert r.status_code == 201


# ---------------------------------------------------------------------------
# /execute, /execute-from, /execute-node
# ---------------------------------------------------------------------------

class TestExecute:
    def test_missing_workflow_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_workflow_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute',
                        json={'workflow_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_not_found_404(self, client, auth_headers):
        r = client.post('/api/workflow/execute',
                        json={'workflow_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        fake = {'run_id': 'r1', 'status': 'completed', 'node_results': {}, 'run': None}
        with patch('app.routes.workflow.WorkflowService.execute_workflow',
                   return_value=fake):
            r = client.post('/api/workflow/execute',
                            json={'workflow_id': str(wf_id)}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['run_id'] == 'r1'

    def test_value_error_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.execute_workflow',
                   side_effect=ValueError('bad node')):
            r = client.post('/api/workflow/execute',
                            json={'workflow_id': str(wf_id)}, headers=auth_headers)
        assert r.status_code == 400

    def test_dlp_blocked_403(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        from app.services.dlp_gate import DLPBlockedError
        with patch('app.routes.workflow.WorkflowService.execute_workflow',
                   side_effect=DLPBlockedError(code='dlp_blocked', matches=[])):
            r = client.post('/api/workflow/execute',
                            json={'workflow_id': str(wf_id)}, headers=auth_headers)
        assert r.status_code == 403

    def test_unexpected_exception_500(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.execute_workflow',
                   side_effect=RuntimeError('boom')):
            r = client.post('/api/workflow/execute',
                            json={'workflow_id': str(wf_id)}, headers=auth_headers)
        assert r.status_code == 500


class TestExecuteFrom:
    def test_missing_workflow_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute-from',
                        json={'node_id': 'n'}, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_node_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute-from',
                        json={'workflow_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_not_found_404(self, client, auth_headers):
        r = client.post('/api/workflow/execute-from', json={
            'workflow_id': str(ObjectId()), 'node_id': 'n',
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        fake = {'run_id': 'r1', 'status': 'completed', 'node_results': {}, 'run': None}
        with patch('app.routes.workflow.WorkflowService.execute_workflow',
                   return_value=fake):
            r = client.post('/api/workflow/execute-from', json={
                'workflow_id': str(wf_id), 'node_id': 'n',
            }, headers=auth_headers)
        assert r.status_code == 200


class TestExecuteNode:
    def test_missing_workflow_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute-node',
                        json={'node_id': 'n'}, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_node_id_400(self, client, auth_headers):
        r = client.post('/api/workflow/execute-node',
                        json={'workflow_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_node_failure_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.execute_single_node',
                   return_value={'status': 'failed', 'error': 'oops', 'node_id': 'n'}):
            r = client.post('/api/workflow/execute-node', json={
                'workflow_id': str(wf_id), 'node_id': 'n',
            }, headers=auth_headers)
        assert r.status_code == 400

    def test_node_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.execute_single_node',
                   return_value={'status': 'completed', 'node_id': 'n', 'text': 'out'}):
            r = client.post('/api/workflow/execute-node', json={
                'workflow_id': str(wf_id), 'node_id': 'n',
            }, headers=auth_headers)
        assert r.status_code == 200


class TestRuns:
    def test_invalid_id_400(self, client, auth_headers):
        r = client.get('/api/workflow/runs/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_value_error_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.get_workflow_runs',
                   side_effect=ValueError('nope')):
            r = client.get(f'/api/workflow/runs/{wf_id}', headers=auth_headers)
        assert r.status_code == 400

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            wf_id = _mk_wf(test_user['_id'])
        with patch('app.routes.workflow.WorkflowService.get_workflow_runs',
                   return_value=[]):
            r = client.get(f'/api/workflow/runs/{wf_id}', headers=auth_headers)
        assert r.status_code == 200
