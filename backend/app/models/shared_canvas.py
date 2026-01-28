from datetime import datetime
from bson import ObjectId
from app.extensions import mongo
import secrets


class SharedCanvasModel:
    """Model for shared code canvases"""
    collection_name = 'shared_canvases'

    @staticmethod
    def get_collection():
        return mongo.db[SharedCanvasModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = SharedCanvasModel.get_collection()
        collection.create_index('owner_id')
        collection.create_index('share_id', unique=True)
        collection.create_index('visibility')
        collection.create_index('created_at')

    @staticmethod
    def create(owner_id, title, html, css, js, visibility='public'):
        """Create a new shared canvas"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        # Generate a short, URL-safe share ID
        share_id = secrets.token_urlsafe(8)

        doc = {
            'share_id': share_id,
            'owner_id': owner_id,
            'title': title or 'Untitled Canvas',
            'html': html or '',
            'css': css or '',
            'js': js or '',
            'visibility': visibility,  # 'public', 'unlisted', 'private'
            'stats': {
                'views': 0,
                'forks': 0
            },
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = SharedCanvasModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(canvas_id):
        """Find canvas by MongoDB ID"""
        if isinstance(canvas_id, str):
            canvas_id = ObjectId(canvas_id)
        return SharedCanvasModel.get_collection().find_one({'_id': canvas_id})

    @staticmethod
    def find_by_share_id(share_id):
        """Find canvas by share ID (for public access)"""
        return SharedCanvasModel.get_collection().find_one({'share_id': share_id})

    @staticmethod
    def find_by_owner(owner_id, skip=0, limit=50):
        """Find all canvases owned by a user"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        cursor = SharedCanvasModel.get_collection().find(
            {'owner_id': owner_id}
        ).sort('created_at', -1).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def count_by_owner(owner_id):
        """Count canvases owned by user"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)
        return SharedCanvasModel.get_collection().count_documents({'owner_id': owner_id})

    @staticmethod
    def update(share_id, owner_id, update_data):
        """Update canvas (owner verification)"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        update_data['updated_at'] = datetime.utcnow()
        return SharedCanvasModel.get_collection().update_one(
            {'share_id': share_id, 'owner_id': owner_id},
            {'$set': update_data}
        )

    @staticmethod
    def increment_views(share_id):
        """Increment view count"""
        return SharedCanvasModel.get_collection().update_one(
            {'share_id': share_id},
            {'$inc': {'stats.views': 1}}
        )

    @staticmethod
    def increment_forks(share_id):
        """Increment fork count"""
        return SharedCanvasModel.get_collection().update_one(
            {'share_id': share_id},
            {'$inc': {'stats.forks': 1}}
        )

    @staticmethod
    def delete(share_id, owner_id):
        """Delete canvas (owner verification)"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        return SharedCanvasModel.get_collection().delete_one({
            'share_id': share_id,
            'owner_id': owner_id
        })
