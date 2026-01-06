from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class ArenaSessionModel:
    """Model for multi-config arena sessions"""

    @staticmethod
    def get_collection():
        return mongo.db.arena_sessions

    @staticmethod
    def create(user_id, config_ids, title='Arena Session'):
        doc = {
            'user_id': ObjectId(user_id),
            'title': title,
            'config_ids': [ObjectId(cid) for cid in config_ids],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        result = ArenaSessionModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(session_id):
        return ArenaSessionModel.get_collection().find_one({'_id': ObjectId(session_id)})

    @staticmethod
    def find_by_user(user_id, skip=0, limit=20):
        return list(ArenaSessionModel.get_collection().find(
            {'user_id': ObjectId(user_id)}
        ).sort('updated_at', -1).skip(skip).limit(limit))

    @staticmethod
    def update(session_id, updates):
        updates['updated_at'] = datetime.utcnow()
        ArenaSessionModel.get_collection().update_one(
            {'_id': ObjectId(session_id)},
            {'$set': updates}
        )

    @staticmethod
    def delete(session_id):
        result = ArenaSessionModel.get_collection().delete_one({'_id': ObjectId(session_id)})
        return result.deleted_count > 0
