from datetime import datetime
from bson import ObjectId
from pymongo.errors import OperationFailure
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
        # Text index: pin language to 'none' so Persian docs (which may carry
        # language='fa'/'fas') don't trip Mongo's "language override unsupported"
        # error — Mongo ships no Persian stemmer. See meeting.py for the same
        # pattern. IndexOptionsConflict (85) is recovered by drop-and-recreate.
        try:
            collection.create_index(
                [('name', 'text'), ('description', 'text'), ('tags', 'text')],
                default_language='none',
                language_override='_no_lang_',
            )
        except OperationFailure as e:
            if e.code in (85, 86):
                for idx in collection.list_indexes():
                    weights = idx.get('weights', {})
                    if set(weights.keys()) == {'name', 'description', 'tags'}:
                        collection.drop_index(idx['name'])
                        break
                collection.create_index(
                    [('name', 'text'), ('description', 'text'), ('tags', 'text')],
                    default_language='none',
                    language_override='_no_lang_',
                )
            else:
                raise
        collection.create_index([('stats.uses_count', -1)])
        collection.create_index('created_at')
        collection.create_index([('project_id', 1), ('created_at', -1)])

    @staticmethod
    def create(name, model_id, model_name, owner_id=None, description='',
               system_prompt='', visibility='private', avatar=None,
               parameters=None, tags=None, project_id=None, workspace_id=None):
        """Create a new LLM config.

        visibility ∈ {'private', 'public', 'template', 'project'}.
        project_id / workspace_id optional — set when the config is scoped to a
        project (visibility == 'project') or simply tracked under a workspace.
        """
        if owner_id and isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if workspace_id and isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)

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
            'visibility': visibility,  # 'private', 'public', 'template', 'project'
            'owner_id': owner_id,
            'project_id': project_id,
            'workspace_id': workspace_id,
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
    def find_by_project(project_id, skip=0, limit=50):
        """Find configs scoped to a specific project."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        cursor = LLMConfigModel.get_collection().find(
            {'project_id': project_id}
        ).sort('created_at', -1).skip(skip).limit(limit)
        return list(cursor)

    @staticmethod
    def find_visible_to(user_id, project_id=None, skip=0, limit=100):
        """Return configs the caller can see.

        Composition: caller's private configs + project's project-scoped configs
        (when project_id is provided) + all public + all templates. Mongo $or
        de-duplicates by _id naturally; sort by created_at desc.
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        query_or = [
            {'owner_id': user_id},
            {'visibility': {'$in': ['public', 'template']}},
        ]
        if project_id:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query_or.append({'project_id': project_id})
        cursor = LLMConfigModel.get_collection().find(
            {'$or': query_or}
        ).sort('created_at', -1).skip(skip).limit(limit)
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
    def duplicate(config_id, new_owner_id, new_name=None, project_id=None, workspace_id=None):
        """Duplicate a config for a new owner.

        ``project_id`` / ``workspace_id`` let callers (e.g. gallery use_config,
        P2.25) propagate the caller's active scope so duplicates don't become
        orphan rows that downstream rollups can't attribute.
        """
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
            tags=original['tags'],
            project_id=project_id,
            workspace_id=workspace_id,
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
