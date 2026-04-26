from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class GeneratedVideoModel:
    """Model for AI-generated videos (OpenRouter ``/videos`` endpoint)."""

    _indexes_ensured = False

    @staticmethod
    def get_collection():
        collection = mongo.db.generated_videos
        if not GeneratedVideoModel._indexes_ensured:
            try:
                collection.create_index('user_id')
                collection.create_index([('created_at', -1)])
                GeneratedVideoModel._indexes_ensured = True
            except Exception:
                pass
        return collection

    @staticmethod
    def create(
        user_id,
        prompt,
        model,
        local_path,
        video_url,
        openrouter_generation_id,
        frame_image_id=None,
        duration_sec=None,
        resolution=None,
        aspect_ratio=None,
        generate_audio=True,
        seed=None,
        metadata=None,
    ):
        """Insert a new generated-video document.

        ``local_path`` is the absolute on-disk location of the downloaded mp4
        under ``UPLOAD_FOLDER``. ``video_url`` is the server-relative path the
        frontend will use to stream it.
        """
        doc = {
            'user_id': ObjectId(user_id) if user_id else None,
            'prompt': prompt,
            'model': model,
            'frame_image_id': ObjectId(frame_image_id) if frame_image_id else None,
            'duration_sec': int(duration_sec) if duration_sec is not None else None,
            'resolution': resolution,
            'aspect_ratio': aspect_ratio,
            'generate_audio': bool(generate_audio),
            'seed': int(seed) if seed is not None else None,
            'openrouter_generation_id': openrouter_generation_id,
            'local_path': local_path,
            'video_url': video_url,
            'metadata': metadata or {},
            'is_favorite': False,
            'created_at': datetime.utcnow(),
        }
        result = GeneratedVideoModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(video_id):
        return GeneratedVideoModel.get_collection().find_one({'_id': ObjectId(video_id)})

    @staticmethod
    def find_by_user(user_id, limit=50, skip=0):
        return list(
            GeneratedVideoModel.get_collection()
            .find({'user_id': ObjectId(user_id)})
            .sort('created_at', -1)
            .skip(skip)
            .limit(limit)
        )

    @staticmethod
    def delete(video_id):
        result = GeneratedVideoModel.get_collection().delete_one({'_id': ObjectId(video_id)})
        return result.deleted_count > 0
