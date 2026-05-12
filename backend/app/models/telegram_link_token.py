import secrets
from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


class TelegramLinkTokenModel:
    collection_name = 'telegram_link_tokens'

    @staticmethod
    def get_collection():
        return mongo.db[TelegramLinkTokenModel.collection_name]

    @staticmethod
    def create_indexes():
        col = TelegramLinkTokenModel.get_collection()
        col.create_index('token', unique=True)
        col.create_index('expires_at', expireAfterSeconds=0)  # TTL

    @staticmethod
    def create(user_id, ttl_seconds=600):
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        token = secrets.token_urlsafe(32)
        TelegramLinkTokenModel.get_collection().insert_one({
            'token': token,
            'user_id': user_id,
            'expires_at': datetime.utcnow() + timedelta(seconds=ttl_seconds),
            'created_at': datetime.utcnow(),
        })
        return token

    @staticmethod
    def peek(token):
        """Find without deleting; returns user_id (str) or None.

        Used by the confirmation step in the Telegram bot (P0.13): the user
        sees who/what they are about to link to and must explicitly confirm
        before we destructively bind their Telegram ID.
        """
        doc = TelegramLinkTokenModel.get_collection().find_one({'token': token})
        if not doc:
            return None
        if doc['expires_at'] < datetime.utcnow():
            return None
        return str(doc['user_id'])

    @staticmethod
    def consume(token):
        """Atomic find+delete; returns user_id (str) or None if missing/expired"""
        doc = TelegramLinkTokenModel.get_collection().find_one_and_delete(
            {'token': token}
        )
        if not doc:
            return None
        if doc['expires_at'] < datetime.utcnow():
            return None
        return str(doc['user_id'])
