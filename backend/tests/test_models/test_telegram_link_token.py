import time
from datetime import datetime, timedelta
from bson import ObjectId
from app.models.telegram_link_token import TelegramLinkTokenModel


class TestTelegramLinkToken:
    def test_create_returns_url_safe_token(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        assert isinstance(token, str)
        assert 30 <= len(token) <= 64
        # URL-safe base64 alphabet only
        assert all(c.isalnum() or c in '-_' for c in token)

    def test_consume_returns_user_id_once(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']))
        first = TelegramLinkTokenModel.consume(token)
        assert first == str(test_user['_id'])
        # Second consume = None
        assert TelegramLinkTokenModel.consume(token) is None

    def test_consume_unknown_token_returns_none(self, db):
        assert TelegramLinkTokenModel.consume('does-not-exist') is None

    def test_consume_expired_token_returns_none(self, db, test_user):
        token = TelegramLinkTokenModel.create(str(test_user['_id']), ttl_seconds=1)
        # Manually backdate expiry
        from app.extensions import mongo
        mongo.db.telegram_link_tokens.update_one(
            {'token': token},
            {'$set': {'expires_at': datetime.utcnow() - timedelta(seconds=10)}}
        )
        assert TelegramLinkTokenModel.consume(token) is None
