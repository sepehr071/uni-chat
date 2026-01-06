from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class ArenaMessageModel:
    """Model for arena chat messages"""

    @staticmethod
    def get_collection():
        return mongo.db.arena_messages

    @staticmethod
    def create(session_id, role, content, config_id=None, metadata=None):
        doc = {
            'session_id': ObjectId(session_id),
            'role': role,
            'content': content,
            'config_id': ObjectId(config_id) if config_id else None,
            'metadata': metadata or {},
            'created_at': datetime.utcnow()
        }
        result = ArenaMessageModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_session(session_id):
        return list(ArenaMessageModel.get_collection().find(
            {'session_id': ObjectId(session_id)}
        ).sort('created_at', 1))

    @staticmethod
    def find_by_session_and_config(session_id, config_id):
        return list(ArenaMessageModel.get_collection().find({
            'session_id': ObjectId(session_id),
            '$or': [
                {'config_id': ObjectId(config_id)},
                {'config_id': None, 'role': 'user'}
            ]
        }).sort('created_at', 1))

    @staticmethod
    def delete_by_session(session_id):
        result = ArenaMessageModel.get_collection().delete_many({'session_id': ObjectId(session_id)})
        return result.deleted_count
