from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class LLMConfigModel:
    collection_name = 'llm_configs'

    @staticmethod
    def get_collection():
        return mongo.db[LLMConfigModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = LLMConfigModel.get_collection()
        collection.create_index('owner_id')
        collection.create_index('visibility')
        collection.create_index([('name', 'text'), ('description', 'text'), ('tags', 'text')])
        collection.create_index([('stats.uses_count', -1)])
        collection.create_index('created_at')

    @staticmethod
    def create(name, model_id, model_name, owner_id=None, description='',
               system_prompt='', visibility='private', avatar=None,
               parameters=None, tags=None):
        """Create a new LLM config"""
        if owner_id and isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        default_parameters = {
            'temperature': 0.7,
            'max_tokens': 2048,
            'top_p': 1.0,
            'frequency_penalty': 0.0,
            'presence_penalty': 0.0
        }

        if parameters:
            default_parameters.update(parameters)

        default_avatar = {
            'type': 'initials',
            'value': name[:2].upper() if name else 'AI'
        }

        config_doc = {
            'name': name,
            'description': description,
            'system_prompt': system_prompt,
            'model_id': model_id,
            'model_name': model_name,
            'avatar': avatar or default_avatar,
            'parameters': default_parameters,
            'visibility': visibility,  # 'private', 'public', 'template'
            'owner_id': owner_id,
            'stats': {
                'uses_count': 0,
                'saves_count': 0,
                'avg_rating': 0.0
            },
            'tags': tags or [],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = LLMConfigModel.get_collection().insert_one(config_doc)
        config_doc['_id'] = result.inserted_id
        return config_doc

    @staticmethod
    def find_by_id(config_id):
        """Find config by ID"""
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return LLMConfigModel.get_collection().find_one({'_id': config_id})

    @staticmethod
    def find_by_ids(config_ids):
        """Find multiple configs by IDs in a single query"""
        if not config_ids:
            return []
        object_ids = [ObjectId(cid) if isinstance(cid, str) else cid for cid in config_ids]
        return list(LLMConfigModel.get_collection().find({'_id': {'$in': object_ids}}))

    @staticmethod
    def find_by_owner(owner_id, skip=0, limit=50):
        """Find configs owned by a user"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        cursor = LLMConfigModel.get_collection().find(
            {'owner_id': owner_id}
        ).sort('created_at', -1).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def find_public(search=None, tags=None, model=None, sort_by='uses_count',
                    skip=0, limit=20):
        """Find public configs for gallery"""
        query = {'visibility': 'public'}

        if search:
            query['$text'] = {'$search': search}

        if tags:
            query['tags'] = {'$in': tags if isinstance(tags, list) else [tags]}

        if model:
            query['model_id'] = model

        sort_field = f'stats.{sort_by}' if sort_by in ['uses_count', 'saves_count', 'avg_rating'] else sort_by
        sort_order = -1

        cursor = LLMConfigModel.get_collection().find(query).sort(
            sort_field, sort_order
        ).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def find_templates(skip=0, limit=50):
        """Find admin-created templates"""
        cursor = LLMConfigModel.get_collection().find(
            {'visibility': 'template'}
        ).sort('stats.uses_count', -1).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def update(config_id, update_data):
        """Update config"""
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        update_data['updated_at'] = datetime.utcnow()
        return LLMConfigModel.get_collection().update_one(
            {'_id': config_id},
            {'$set': update_data}
        )

    @staticmethod
    def increment_uses(config_id):
        """Increment uses count"""
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return LLMConfigModel.get_collection().update_one(
            {'_id': config_id},
            {'$inc': {'stats.uses_count': 1}}
        )

    @staticmethod
    def increment_saves(config_id):
        """Increment saves count"""
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return LLMConfigModel.get_collection().update_one(
            {'_id': config_id},
            {'$inc': {'stats.saves_count': 1}}
        )

    @staticmethod
    def set_visibility(config_id, visibility):
        """Change config visibility"""
        return LLMConfigModel.update(config_id, {'visibility': visibility})

    @staticmethod
    def delete(config_id):
        """Delete a config"""
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return LLMConfigModel.get_collection().delete_one({'_id': config_id})

    @staticmethod
    def duplicate(config_id, new_owner_id, new_name=None):
        """Duplicate a config for a new owner"""
        original = LLMConfigModel.find_by_id(config_id)
        if not original:
            return None

        if isinstance(new_owner_id, str):
            new_owner_id = ObjectId(new_owner_id)

        return LLMConfigModel.create(
            name=new_name or f"{original['name']} (copy)",
            model_id=original['model_id'],
            model_name=original['model_name'],
            owner_id=new_owner_id,
            description=original['description'],
            system_prompt=original['system_prompt'],
            visibility='private',
            avatar=original['avatar'],
            parameters=original['parameters'],
            tags=original['tags']
        )

    @staticmethod
    def count_by_owner(owner_id):
        """Count configs owned by user"""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)
        return LLMConfigModel.get_collection().count_documents({'owner_id': owner_id})

    @staticmethod
    def count_public():
        """Count public configs"""
        return LLMConfigModel.get_collection().count_documents({'visibility': 'public'})
