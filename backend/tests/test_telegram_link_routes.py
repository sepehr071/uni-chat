import os
from app.models.user import UserModel
from app.models.telegram_link_token import TelegramLinkTokenModel


class TestTelegramLinkRoutes:
    def test_status_unlinked(self, client, test_user, auth_headers):
        r = client.get('/api/users/telegram/status', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body == {'linked': False, 'telegram_username': None}

    def test_generate_token_returns_link_url(self, client, test_user, auth_headers, monkeypatch):
        monkeypatch.setenv('TELEGRAM_BOT_USERNAME', 'unichat_ai_bot')
        r = client.post('/api/users/telegram/generate-token', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['link_url'].startswith('https://t.me/unichat_ai_bot?start=')
        assert len(body['link_url'].split('start=')[1]) >= 30

    def test_status_linked_after_consume(self, client, test_user, auth_headers, db):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        UserModel.set_telegram_link(str(test_user['_id']), 9999, 'me')
        r = client.get('/api/users/telegram/status', headers=auth_headers)
        assert r.get_json() == {'linked': True, 'telegram_username': 'me'}

    def test_unlink_clears_telegram_id(self, client, test_user, auth_headers, db):
        UserModel.set_telegram_link(str(test_user['_id']), 9999, 'me')
        r = client.delete('/api/users/telegram/unlink', headers=auth_headers)
        assert r.status_code == 200
        u = UserModel.find_by_id(str(test_user['_id']))
        assert u.get('telegram_id') is None

    def test_routes_require_jwt(self, client):
        assert client.get('/api/users/telegram/status').status_code == 401
        assert client.post('/api/users/telegram/generate-token').status_code == 401
        assert client.delete('/api/users/telegram/unlink').status_code == 401
