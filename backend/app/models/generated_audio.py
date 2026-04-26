from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class GeneratedAudioModel:
    """Model for AI-generated speech clips (TTS)."""

    _indexes_ensured = False

    @staticmethod
    def get_collection():
        collection = mongo.db.generated_audio
        if not GeneratedAudioModel._indexes_ensured:
            try:
                collection.create_index('user_id')
                collection.create_index([('created_at', -1)])
                GeneratedAudioModel._indexes_ensured = True
            except Exception:
                # Index creation is best-effort; don't break callers.
                pass
        return collection

    @staticmethod
    def create(
        user_id,
        text,
        model,
        voice,
        speed,
        mime,
        audio_data_uri,
        duration_ms=None,
        metadata=None,
    ):
        """Insert a new generated-audio document.

        Returns the full inserted document (including ``_id`` as ObjectId) so
        callers can mirror :meth:`GeneratedImageModel.create`.
        """
        doc = {
            'user_id': ObjectId(user_id) if user_id else None,
            'text': text,
            'model': model,
            'voice': voice,
            'speed': float(speed) if speed is not None else 1.0,
            'mime': mime,
            'audio_data_uri': audio_data_uri,
            'duration_ms': int(duration_ms) if duration_ms is not None else None,
            'metadata': metadata or {},
            'is_favorite': False,
            'created_at': datetime.utcnow(),
        }
        result = GeneratedAudioModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(audio_id):
        return GeneratedAudioModel.get_collection().find_one({'_id': ObjectId(audio_id)})

    @staticmethod
    def find_by_user(user_id, limit=50, skip=0):
        return list(
            GeneratedAudioModel.get_collection()
            .find({'user_id': ObjectId(user_id)})
            .sort('created_at', -1)
            .skip(skip)
            .limit(limit)
        )

    @staticmethod
    def delete(audio_id):
        result = GeneratedAudioModel.get_collection().delete_one({'_id': ObjectId(audio_id)})
        return result.deleted_count > 0
