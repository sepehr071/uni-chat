"""Tests for app/routes/chat.py — non-streaming send + message CRUD + edit + regenerate."""

from unittest.mock import patch

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.conversation import ConversationModel
from app.models.llm_config import LLMConfigModel
from app.models.message import MessageModel


def _mk_config(uid):
    return LLMConfigModel.create(
        name='Cfg', model_id='openai/gpt-4', model_name='GPT-4',
        owner_id=uid, visibility='private',
    )


def _mk_conv(uid, config_id):
    return ConversationModel.create(uid, str(config_id), title='C')


def _ok_response(content='hi back'):
    return {
        'choices': [{'message': {'content': content}, 'finish_reason': 'stop'}],
        'usage': {'prompt_tokens': 5, 'completion_tokens': 3},
    }


# ---------------------------------------------------------------------------
# /send
# ---------------------------------------------------------------------------

class TestSend:
    def test_missing_message_400(self, client, auth_headers):
        r = client.post('/api/chat/send',
                        json={'config_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_config_400(self, client, auth_headers):
        r = client.post('/api/chat/send', json={'message': 'hi'}, headers=auth_headers)
        assert r.status_code == 400

    def test_config_not_found_404(self, client, auth_headers):
        r = client.post('/api/chat/send', json={
            'message': 'hi', 'config_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_send_creates_conversation_and_messages(
            self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value=_ok_response()):
            r = client.post('/api/chat/send', json={
                'message': 'hello', 'config_id': str(cfg['_id']),
            }, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['user_message']['content'] == 'hello'
        assert body['assistant_message']['content'] == 'hi back'
        assert body['is_new_conversation'] is True

    def test_existing_conversation_path(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value=_ok_response()):
            r = client.post('/api/chat/send', json={
                'conversation_id': str(conv['_id']),
                'message': 'hi', 'config_id': str(cfg['_id']),
            }, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['is_new_conversation'] is False

    def test_conv_not_found_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        r = client.post('/api/chat/send', json={
            'conversation_id': str(ObjectId()),
            'message': 'hi', 'config_id': str(cfg['_id']),
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_openrouter_error_500(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value={'error': {'message': 'boom'}}):
            r = client.post('/api/chat/send', json={
                'message': 'hi', 'config_id': str(cfg['_id']),
            }, headers=auth_headers)
        assert r.status_code == 500

    def test_token_limit_429(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            mongo.db.users.update_one(
                {'_id': test_user['_id']},
                {'$set': {'usage.tokens_limit': 100, 'usage.tokens_used': 100}},
            )
        r = client.post('/api/chat/send', json={
            'message': 'hi', 'config_id': str(cfg['_id']),
        }, headers=auth_headers)
        assert r.status_code == 429


# ---------------------------------------------------------------------------
# Messages list + delete
# ---------------------------------------------------------------------------

class TestMessagesList:
    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
            conv = _mk_conv(ObjectId(), cfg['_id'])
        r = client.get(f"/api/chat/{conv['_id']}/messages", headers=auth_headers)
        assert r.status_code == 404

    def test_returns_messages(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.get(f"/api/chat/{conv['_id']}/messages", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.get_json()['messages']) == 1


class TestMessageDelete:
    def test_missing_message_404(self, client, auth_headers):
        r = client.delete(f'/api/chat/messages/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
            conv = _mk_conv(ObjectId(), cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.delete(f"/api/chat/messages/{m['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_owner_can_delete(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.delete(f"/api/chat/messages/{m['_id']}", headers=auth_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Edit message
# ---------------------------------------------------------------------------

class TestMessageEdit:
    def test_invalid_id_400(self, client, auth_headers):
        r = client.put('/api/chat/messages/temp-x',
                       json={'content': 'hi'}, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_content_400(self, client, auth_headers):
        r = client.put(f'/api/chat/messages/{ObjectId()}',
                       json={'content': ''}, headers=auth_headers)
        assert r.status_code == 400

    def test_not_found_404(self, client, auth_headers):
        r = client.put(f'/api/chat/messages/{ObjectId()}',
                       json={'content': 'x'}, headers=auth_headers)
        assert r.status_code == 404

    def test_only_user_message_can_edit_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'assistant', 'reply', branch_id='main')
        r = client.put(f"/api/chat/messages/{m['_id']}",
                       json={'content': 'x'}, headers=auth_headers)
        assert r.status_code == 400

    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
            conv = _mk_conv(ObjectId(), cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.put(f"/api/chat/messages/{m['_id']}",
                       json={'content': 'x'}, headers=auth_headers)
        assert r.status_code == 404

    def test_edit_no_regen(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.put(f"/api/chat/messages/{m['_id']}",
                       json={'content': 'edited', 'regenerate': False},
                       headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['message']['content'] == 'edited'
        assert body['deleted_count'] == 0

    def test_edit_with_regen(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
            MessageModel.create(conv['_id'], 'assistant', 'reply', branch_id='main')
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value=_ok_response('new')):
            r = client.put(f"/api/chat/messages/{m['_id']}",
                           json={'content': 'edited'}, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['assistant_message']['content'] == 'new'

    def test_edit_with_regen_llm_error_500(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value={'error': {'message': 'boom'}}):
            r = client.put(f"/api/chat/messages/{m['_id']}",
                           json={'content': 'edited'}, headers=auth_headers)
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# Regenerate
# ---------------------------------------------------------------------------

class TestRegenerate:
    def test_missing_404(self, client, auth_headers):
        r = client.post(f'/api/chat/regenerate/{ObjectId()}', json={},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_not_assistant_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
        r = client.post(f"/api/chat/regenerate/{m['_id']}", json={},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            cfg = _mk_config(ObjectId())
            conv = _mk_conv(ObjectId(), cfg['_id'])
            m = MessageModel.create(conv['_id'], 'assistant', 'r', branch_id='main')
        r = client.post(f"/api/chat/regenerate/{m['_id']}", json={},
                        headers=auth_headers)
        assert r.status_code == 404

    def test_no_user_message_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            m = MessageModel.create(conv['_id'], 'assistant', 'reply',
                                    branch_id='main')
        r = client.post(f"/api/chat/regenerate/{m['_id']}", json={},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_inline_regen(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
            a = MessageModel.create(conv['_id'], 'assistant', 'reply', branch_id='main')
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value=_ok_response('new')):
            r = client.post(f"/api/chat/regenerate/{a['_id']}", json={},
                            headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['message']['content'] == 'new'
        assert body['branch_id'] == 'main'

    def test_regen_with_branch(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
            a = MessageModel.create(conv['_id'], 'assistant', 'reply', branch_id='main')
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value=_ok_response('new')):
            r = client.post(f"/api/chat/regenerate/{a['_id']}",
                            json={'create_branch': True, 'branch_name': 'B2'},
                            headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'new_branch_id' in body
        assert body['branch_id'] == body['new_branch_id']

    def test_regen_llm_error_500(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = _mk_config(test_user['_id'])
            conv = _mk_conv(test_user['_id'], cfg['_id'])
            MessageModel.create(conv['_id'], 'user', 'hi', branch_id='main')
            a = MessageModel.create(conv['_id'], 'assistant', 'reply', branch_id='main')
        with patch('app.routes.chat.OpenRouterService.chat_completion',
                   return_value={'error': {'message': 'boom'}}):
            r = client.post(f"/api/chat/regenerate/{a['_id']}", json={},
                            headers=auth_headers)
        assert r.status_code == 500
