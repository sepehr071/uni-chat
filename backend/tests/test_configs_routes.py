"""Tests for app/routes/configs.py — LLM config CRUD + publish + duplicate."""

from unittest.mock import patch

import pytest
from bson import ObjectId

from app.models.llm_config import LLMConfigModel


def _mk_config(owner_id=None, **kw):
    base = dict(name='Cfg', model_id='openai/gpt-4', model_name='GPT-4',
                owner_id=owner_id, description='', system_prompt='',
                visibility='private')
    base.update(kw)
    return LLMConfigModel.create(**base)


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

class TestList:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/configs', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['configs'] == []
        assert r.get_json()['total'] == 0

    def test_returns_owned(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            _mk_config(test_user['_id'])
        r = client.get('/api/configs', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 1

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/configs?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_403(self, client, auth_headers):
        r = client.get(f'/api/configs?project_id={ObjectId()}', headers=auth_headers)
        assert r.status_code == 403


class TestGet:
    def test_missing_404(self, client, auth_headers):
        r = client.get(f'/api/configs/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_private_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='private')
        r = client.get(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_public_visible_to_other_user(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='public')
        r = client.get(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 200

    def test_project_scoped_other_user_no_access_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='project',
                             project_id=ObjectId())
        r = client.get(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_owner_can_get_private(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        r = client.get(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestCreate:
    def _body(self, **kw):
        b = {'name': 'Cfg', 'model_id': 'openai/gpt-4'}
        b.update(kw)
        return b

    def test_blank_name_400(self, client, auth_headers):
        r = client.post('/api/configs', json=self._body(name=''), headers=auth_headers)
        assert r.status_code == 400

    def test_missing_model_id_400(self, client, auth_headers):
        r = client.post('/api/configs', json={'name': 'Cfg'}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_system_prompt_400(self, client, auth_headers):
        r = client.post('/api/configs',
                        json=self._body(system_prompt='x' * 10001),
                        headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_visibility_400(self, client, auth_headers):
        r = client.post('/api/configs',
                        json=self._body(visibility='secret'),
                        headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.post('/api/configs',
                        json=self._body(project_id='bad'),
                        headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_403(self, client, auth_headers):
        r = client.post('/api/configs',
                        json=self._body(project_id=str(ObjectId())),
                        headers=auth_headers)
        assert r.status_code == 403

    def test_basic_create_visibility_defaults_to_private(self, client, test_user, auth_headers):
        r = client.post('/api/configs', json=self._body(), headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['config']['visibility'] == 'private'


# ---------------------------------------------------------------------------
# Update / delete / publish / unpublish
# ---------------------------------------------------------------------------

class TestUpdate:
    def _cfg(self, app, uid):
        with app.app_context():
            return _mk_config(uid)

    def test_other_owner_404(self, app, db, client, auth_headers):
        cfg = self._cfg(app, ObjectId())
        r = client.put(f"/api/configs/{cfg['_id']}",
                       json={'name': 'X'}, headers=auth_headers)
        assert r.status_code == 404

    def test_cannot_reassign_project(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'], project_id=ObjectId())
        r = client.put(f"/api/configs/{cfg['_id']}",
                       json={'project_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 400

    def test_blank_name_rejected(self, app, db, client, test_user, auth_headers):
        cfg = self._cfg(app, test_user['_id'])
        r = client.put(f"/api/configs/{cfg['_id']}",
                       json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_system_prompt_rejected(self, app, db, client, test_user, auth_headers):
        cfg = self._cfg(app, test_user['_id'])
        r = client.put(f"/api/configs/{cfg['_id']}",
                       json={'system_prompt': 'x' * 10001}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_visibility_rejected(self, app, db, client, test_user, auth_headers):
        cfg = self._cfg(app, test_user['_id'])
        r = client.put(f"/api/configs/{cfg['_id']}",
                       json={'visibility': 'secret'}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_all_fields(self, app, db, client, test_user, auth_headers):
        cfg = self._cfg(app, test_user['_id'])
        r = client.put(f"/api/configs/{cfg['_id']}", json={
            'name': 'New',
            'description': 'd',
            'system_prompt': 'sp',
            'model_id': 'm',
            'model_name': 'mn',
            'avatar': {'type': 'initials', 'value': 'NX'},
            'parameters': {'temperature': 0.1},
            'tags': ['x'],
            'visibility': 'public',
        }, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['config']
        assert body['name'] == 'New'
        assert body['model_id'] == 'm'
        assert body['model_name'] == 'mn'
        assert body['visibility'] == 'public'


class TestDelete:
    def test_other_owner_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
        r = client.delete(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_owner_can_delete(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        r = client.delete(f"/api/configs/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 200


class TestPublishUnpublish:
    def test_publish_other_owner_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
        r = client.post(f"/api/configs/{cfg['_id']}/publish", headers=auth_headers)
        assert r.status_code == 404

    def test_publish_then_unpublish(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        r = client.post(f"/api/configs/{cfg['_id']}/publish", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['visibility'] == 'public'
        r2 = client.post(f"/api/configs/{cfg['_id']}/unpublish", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.get_json()['visibility'] == 'private'

    def test_unpublish_other_owner_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='public')
        r = client.post(f"/api/configs/{cfg['_id']}/unpublish", headers=auth_headers)
        assert r.status_code == 404


class TestDuplicate:
    def test_missing_404(self, client, auth_headers):
        r = client.post(f'/api/configs/{ObjectId()}/duplicate', json={},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_duplicate_private_other_owner_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='private')
        r = client.post(f"/api/configs/{cfg['_id']}/duplicate",
                        json={}, headers=auth_headers)
        assert r.status_code == 404

    def test_duplicate_public_ok(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId(), visibility='public', name='Orig')
        r = client.post(f"/api/configs/{cfg['_id']}/duplicate",
                        json={'name': 'Mine'}, headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['config']['name'] == 'Mine'

    def test_duplicate_owned(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        r = client.post(f"/api/configs/{cfg['_id']}/duplicate", json={},
                        headers=auth_headers)
        assert r.status_code == 201


# ---------------------------------------------------------------------------
# /enhance-prompt
# ---------------------------------------------------------------------------

class TestEnhancePrompt:
    def test_missing_prompt_400(self, client, auth_headers):
        r = client.post('/api/configs/enhance-prompt', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_prompt_400(self, client, auth_headers):
        r = client.post('/api/configs/enhance-prompt',
                        json={'prompt': 'x' * 10001}, headers=auth_headers)
        assert r.status_code == 400

    def test_success_with_mocked_llm(self, client, auth_headers):
        fake = {'choices': [{'message': {'content': 'IMPROVED'}}]}
        with patch('app.routes.configs.OpenRouterService.chat_completion',
                   return_value=fake):
            r = client.post('/api/configs/enhance-prompt',
                            json={'prompt': 'be nice'}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['enhanced_prompt'] == 'IMPROVED'

    def test_llm_error_returns_500(self, client, auth_headers):
        with patch('app.routes.configs.OpenRouterService.chat_completion',
                   return_value={'error': {'message': 'boom'}}):
            r = client.post('/api/configs/enhance-prompt',
                            json={'prompt': 'x'}, headers=auth_headers)
        assert r.status_code == 500

    def test_malformed_response_500(self, client, auth_headers):
        with patch('app.routes.configs.OpenRouterService.chat_completion',
                   return_value={}):
            r = client.post('/api/configs/enhance-prompt',
                            json={'prompt': 'x'}, headers=auth_headers)
        assert r.status_code == 500
