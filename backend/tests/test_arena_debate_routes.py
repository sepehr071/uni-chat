"""Tests for app/routes/arena.py + app/routes/debate.py (non-stream paths)."""

import pytest
from bson import ObjectId

from app.models.arena_message import ArenaMessageModel
from app.models.arena_session import ArenaSessionModel
from app.models.debate_message import DebateMessageModel
from app.models.debate_session import DebateSessionModel
from app.models.llm_config import LLMConfigModel


def _mk_cfg(uid):
    return LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                  owner_id=uid)


# ===========================================================================
# Arena
# ===========================================================================

class TestArenaCreate:
    def test_too_few_configs_400(self, client, auth_headers):
        r = client.post('/api/arena/sessions',
                        json={'config_ids': [str(ObjectId())]},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_too_many_configs_400(self, client, auth_headers):
        r = client.post('/api/arena/sessions',
                        json={'config_ids': [str(ObjectId()) for _ in range(5)]},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_unknown_config_404(self, client, auth_headers):
        r = client.post('/api/arena/sessions',
                        json={'config_ids': [str(ObjectId()), str(ObjectId())]},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_create_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            a = _mk_cfg(test_user['_id'])
            b = _mk_cfg(test_user['_id'])
        r = client.post('/api/arena/sessions', json={
            'config_ids': [str(a['_id']), str(b['_id'])], 'title': 'A vs B',
        }, headers=auth_headers)
        assert r.status_code == 201


class TestArenaListGetDelete:
    def test_list_empty(self, client, test_user, auth_headers):
        r = client.get('/api/arena/sessions', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['sessions'] == []

    def test_get_not_found(self, client, auth_headers):
        r = client.get(f'/api/arena/sessions/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_get_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            sess = ArenaSessionModel.create(str(ObjectId()),
                                            [str(ObjectId()), str(ObjectId())])
        r = client.get(f"/api/arena/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 403

    def test_get_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            a = _mk_cfg(test_user['_id'])
            b = _mk_cfg(test_user['_id'])
            sess = ArenaSessionModel.create(str(test_user['_id']),
                                             [str(a['_id']), str(b['_id'])])
            ArenaMessageModel.create(sess['_id'], 'user', 'hi')
        r = client.get(f"/api/arena/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert len(body['messages']) == 1
        assert len(body['configs']) == 2

    def test_delete_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            sess = ArenaSessionModel.create(str(ObjectId()),
                                            [str(ObjectId()), str(ObjectId())])
        r = client.delete(f"/api/arena/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 403

    def test_delete_not_found(self, client, auth_headers):
        r = client.delete(f'/api/arena/sessions/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_delete_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            sess = ArenaSessionModel.create(str(test_user['_id']),
                                             [str(ObjectId()), str(ObjectId())])
        r = client.delete(f"/api/arena/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 200


# ===========================================================================
# Debate
# ===========================================================================

class TestDebateCreate:
    def test_missing_topic_400(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'config_ids': ['quick:google/gemini-3-flash-preview',
                           'quick:x-ai/grok-4.1-fast'],
            'judge_config_id': 'quick:x-ai/grok-4.1-fast',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_too_few_configs_400(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'AI safety',
            'config_ids': ['quick:google/gemini-3-flash-preview'],
            'judge_config_id': 'quick:x-ai/grok-4.1-fast',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_too_many_configs_400(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'AI safety',
            'config_ids': ['quick:m'] * 6,
            'judge_config_id': 'quick:x-ai/grok-4.1-fast',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_judge_400(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'AI safety',
            'config_ids': ['quick:m1', 'quick:m2'],
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_config_not_found_404(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'T',
            'config_ids': [str(ObjectId()), 'quick:m'],
            'judge_config_id': 'quick:m',
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_judge_not_found_404(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'T',
            'config_ids': ['quick:m1', 'quick:m2'],
            'judge_config_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_create_success(self, client, auth_headers):
        r = client.post('/api/debate/sessions', json={
            'topic': 'AI alignment',
            'config_ids': ['quick:google/gemini-3-flash-preview',
                           'quick:x-ai/grok-4.1-fast'],
            'judge_config_id': 'quick:openai/gpt-5.2',
            'rounds': 2, 'max_tokens': 500,
            'thinking_type': 'logical', 'response_length': 'short',
        }, headers=auth_headers)
        assert r.status_code == 201


class TestDebateListGetCancelDelete:
    def test_list_empty(self, client, test_user, auth_headers):
        r = client.get('/api/debate/sessions', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 0

    def test_list_enriches_quick_models(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=['quick:google/gemini-3-flash-preview', 'quick:x-ai/grok-4.1-fast'],
                judge_config_id='quick:openai/gpt-5.2', rounds=1, max_tokens=500,
            )
        r = client.get('/api/debate/sessions', headers=auth_headers)
        sess = r.get_json()['sessions'][0]
        assert 'Gemini 3 Flash' in sess['config_names']
        assert sess['judge_name'] == 'GPT-5.2'

    def test_list_includes_real_configs(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            a = _mk_cfg(test_user['_id'])
            DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=[str(a['_id']), 'quick:x-ai/grok-4.1-fast'],
                judge_config_id=str(a['_id']), rounds=1, max_tokens=500,
            )
        r = client.get('/api/debate/sessions', headers=auth_headers)
        sess = r.get_json()['sessions'][0]
        assert 'C' in sess['config_names']

    def test_get_not_found(self, client, auth_headers):
        r = client.get(f'/api/debate/sessions/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_get_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(ObjectId()), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3',
                rounds=1, max_tokens=500,
            )
        r = client.get(f"/api/debate/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 403

    def test_get_success_with_messages(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            a = _mk_cfg(test_user['_id'])
            sess = DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=[str(a['_id']), 'quick:google/gemini-3-flash-preview'],
                judge_config_id=str(a['_id']), rounds=1, max_tokens=500,
            )
            DebateMessageModel.create(sess['_id'], 1, str(a['_id']),
                                       'debater', 'argued', order_in_round=0)
            DebateMessageModel.create(sess['_id'], 1, str(a['_id']),
                                       'judge', 'verdict', order_in_round=1)
        r = client.get(f"/api/debate/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 200
        sd = r.get_json()['session']
        assert len(sd['messages']) == 2
        assert any(m['role'] == 'judge' for m in sd['messages'])
        assert len(sd['debaters']) == 2

    def test_cancel_not_found(self, client, auth_headers):
        r = client.post(f'/api/debate/sessions/{ObjectId()}/cancel',
                        headers=auth_headers)
        assert r.status_code == 404

    def test_cancel_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(ObjectId()), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3', rounds=1, max_tokens=500,
            )
        r = client.post(f"/api/debate/sessions/{sess['_id']}/cancel",
                        headers=auth_headers)
        assert r.status_code == 403

    def test_cancel_invalid_status(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3', rounds=1, max_tokens=500,
            )
            DebateSessionModel.update_status(sess['_id'], 'completed')
        r = client.post(f"/api/debate/sessions/{sess['_id']}/cancel",
                        headers=auth_headers)
        assert r.status_code == 400

    def test_cancel_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3', rounds=1, max_tokens=500,
            )
        r = client.post(f"/api/debate/sessions/{sess['_id']}/cancel",
                        headers=auth_headers)
        assert r.status_code == 200

    def test_delete_not_found(self, client, auth_headers):
        r = client.delete(f'/api/debate/sessions/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_delete_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(ObjectId()), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3', rounds=1, max_tokens=500,
            )
        r = client.delete(f"/api/debate/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 403

    def test_delete_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            sess = DebateSessionModel.create(
                user_id=str(test_user['_id']), topic='T',
                config_ids=['quick:m1', 'quick:m2'],
                judge_config_id='quick:m3', rounds=1, max_tokens=500,
            )
        r = client.delete(f"/api/debate/sessions/{sess['_id']}", headers=auth_headers)
        assert r.status_code == 200
