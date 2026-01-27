from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class GeneratedImageModel:
    """Model for AI-generated images"""

    @staticmethod
    def get_collection():
        return mongo.db.generated_images

    @staticmethod
    def create(user_id, prompt, model_id, image_data, negative_prompt='', settings=None, metadata=None):
        doc = {
            'user_id': ObjectId(user_id),
            'prompt': prompt,
            'negative_prompt': negative_prompt,
            'model_id': model_id,
            'image_data': image_data,
            'settings': settings or {
                'input_images_count': 0,
                'has_input_images': False
            },
            'metadata': metadata or {},
            'is_favorite': False,
            'created_at': datetime.utcnow()
        }
        result = GeneratedImageModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(image_id):
        return GeneratedImageModel.get_collection().find_one({'_id': ObjectId(image_id)})

    @staticmethod
    def find_by_user(user_id, skip=0, limit=20, favorites_only=False):
        query = {'user_id': ObjectId(user_id)}
        if favorites_only:
            query['is_favorite'] = True
        return list(GeneratedImageModel.get_collection().find(query).sort('created_at', -1).skip(skip).limit(limit))

    @staticmethod
    def count_by_user(user_id, favorites_only=False):
        query = {'user_id': ObjectId(user_id)}
        if favorites_only:
            query['is_favorite'] = True
        return GeneratedImageModel.get_collection().count_documents(query)

    @staticmethod
    def toggle_favorite(image_id):
        image = GeneratedImageModel.find_by_id(image_id)
        if image:
            new_value = not image.get('is_favorite', False)
            GeneratedImageModel.get_collection().update_one(
                {'_id': ObjectId(image_id)},
                {'$set': {'is_favorite': new_value}}
            )
            return new_value
        return None

    @staticmethod
    def delete(image_id):
        result = GeneratedImageModel.get_collection().delete_one({'_id': ObjectId(image_id)})
        return result.deleted_count > 0

    @staticmethod
    def delete_many(image_ids, user_id):
        """Delete multiple images by IDs for a user"""
        object_ids = [ObjectId(img_id) for img_id in image_ids]
        result = GeneratedImageModel.get_collection().delete_many({
            '_id': {'$in': object_ids},
            'user_id': ObjectId(user_id)
        })
        return result.deleted_count
