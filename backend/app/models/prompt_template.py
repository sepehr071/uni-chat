from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class PromptTemplateModel:
    """Model for AI image generation prompt templates"""

    @staticmethod
    def get_collection():
        return mongo.db.prompt_templates

    @staticmethod
    def create(name, category, template_text, variables=None, description='', created_by=None):
        """Create a new prompt template"""
        doc = {
            'name': name,
            'category': category,
            'template_text': template_text,
            'variables': variables or [],
            'description': description,
            'thumbnail_url': None,
            'usage_count': 0,
            'is_active': True,
            'created_by': ObjectId(created_by) if created_by else None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        result = PromptTemplateModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(template_id):
        """Find template by ID"""
        return PromptTemplateModel.get_collection().find_one({'_id': ObjectId(template_id)})

    @staticmethod
    def find_all_active():
        """Find all active templates"""
        return list(PromptTemplateModel.get_collection().find({'is_active': True}).sort('category', 1).sort('name', 1))

    @staticmethod
    def find_by_category(category):
        """Find all active templates in a category"""
        return list(PromptTemplateModel.get_collection().find({
            'category': category,
            'is_active': True
        }).sort('name', 1))

    @staticmethod
    def get_categories():
        """Get list of all categories"""
        pipeline = [
            {'$match': {'is_active': True}},
            {'$group': {'_id': '$category', 'count': {'$sum': 1}}},
            {'$sort': {'_id': 1}}
        ]
        categories = list(PromptTemplateModel.get_collection().aggregate(pipeline))
        return [{'category': cat['_id'], 'count': cat['count']} for cat in categories]

    @staticmethod
    def update(template_id, updates):
        """Update a template"""
        updates['updated_at'] = datetime.utcnow()
        result = PromptTemplateModel.get_collection().update_one(
            {'_id': ObjectId(template_id)},
            {'$set': updates}
        )
        return result.modified_count > 0

    @staticmethod
    def delete(template_id):
        """Soft delete a template (set is_active=False)"""
        result = PromptTemplateModel.get_collection().update_one(
            {'_id': ObjectId(template_id)},
            {'$set': {'is_active': False, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0

    @staticmethod
    def increment_usage(template_id):
        """Increment usage count"""
        PromptTemplateModel.get_collection().update_one(
            {'_id': ObjectId(template_id)},
            {'$inc': {'usage_count': 1}}
        )
