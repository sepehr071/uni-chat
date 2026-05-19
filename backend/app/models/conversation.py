from datetime import datetime
from bson import ObjectId
from pymongo.errors import OperationFailure
from app.extensions import mongo


# Sentinel string the route layer translates `?project_id=null` into. Lets
# callers distinguish "no filter" (None) from "filter where project_id is
# null/missing" (the sentinel).
NULL_PROJECT_SENTINEL = '__null__'


class ConversationModel:
    collection_name = 'conversations'

    @staticmethod
    def get_collection():
        return mongo.db[ConversationModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = ConversationModel.get_collection()
        collection.create_index([('user_id', 1), ('last_message_at', -1)])
        collection.create_index([('user_id', 1), ('folder_id', 1)])
        collection.create_index([('user_id', 1), ('is_archived', 1)])
        # Text index: pin language to 'none' so Persian docs (which may carry
        # language='fa'/'fas') don't trip Mongo's "language override unsupported"
        # error — Mongo ships no Persian stemmer. See meeting.py for the same
        # pattern. IndexOptionsConflict (85) is recovered by drop-and-recreate.
        try:
            collection.create_index(
                [('title', 'text')],
                default_language='none',
                language_override='_no_lang_',
            )
        except OperationFailure as e:
            if e.code in (85, 86):
                for idx in collection.list_indexes():
                    key = idx.get('key', {})
                    if key.get('title') == 'text' or key.get('_fts') == 'text':
                        if 'title' in idx.get('weights', {}) and len(idx.get('weights', {})) == 1:
                            collection.drop_index(idx['name'])
                            break
                collection.create_index(
                    [('title', 'text')],
                    default_language='none',
                    language_override='_no_lang_',
                )
            else:
                raise
        # Project-scoped index — additive, legacy ones above untouched.
        collection.create_index(
            [('user_id', 1), ('project_id', 1), ('last_message_at', -1)]
        )

    @staticmethod
    def create(user_id, config_id, title='New conversation', folder_id=None,
               project_id=None):
        """Create a new conversation"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        # Don't convert synthetic config IDs (quick:, agent:) to ObjectId - store as string
        if isinstance(config_id, str) and not (config_id.startswith('quick:') or config_id.startswith('agent:')):
            config_id = ObjectId(config_id)
        if folder_id and isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)

        conversation_doc = {
            'user_id': user_id,
            'config_id': config_id,
            'title': title,
            'folder_id': folder_id,
            'project_id': project_id,
            'tags': [],
            'summary': None,
            'message_count': 0,
            'token_count': {
                'input': 0,
                'output': 0,
                'total': 0
            },
            'last_message_at': datetime.utcnow(),
            'is_pinned': False,
            'is_archived': False,
            'branches': [{
                'id': 'main',
                'name': 'Main',
                'parent_branch': None,
                'branch_point_message_id': None,
                'created_at': datetime.utcnow()
            }],
            'active_branch': 'main',
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = ConversationModel.get_collection().insert_one(conversation_doc)
        conversation_doc['_id'] = result.inserted_id
        return conversation_doc

    @staticmethod
    def find_by_id(conversation_id):
        """Find conversation by ID"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return ConversationModel.get_collection().find_one({'_id': conversation_id})

    @staticmethod
    def find_by_user(user_id, folder_id=None, archived=False, search=None,
                     skip=0, limit=20, sort_by='last_message_at',
                     project_id=None):
        """Find conversations for a user.

        project_id semantics:
            None              -> no project filter (legacy behavior preserved)
            NULL_PROJECT_SENTINEL ('__null__') -> filter where project_id is null/missing
            ObjectId / str    -> exact match
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id, 'is_archived': archived}

        if folder_id:
            if isinstance(folder_id, str):
                folder_id = ObjectId(folder_id)
            query['folder_id'] = folder_id
        elif folder_id is None and not search:
            # By default, show conversations without folder
            pass

        if project_id == NULL_PROJECT_SENTINEL:
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id

        if search:
            query['$text'] = {'$search': search}

        sort_order = -1  # descending
        cursor = ConversationModel.get_collection().find(query).sort(
            sort_by, sort_order
        ).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def update(conversation_id, update_data):
        """Update conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        update_data['updated_at'] = datetime.utcnow()
        return ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {'$set': update_data}
        )

    @staticmethod
    def update_title(conversation_id, title):
        """Update conversation title"""
        return ConversationModel.update(conversation_id, {'title': title})

    @staticmethod
    def move_to_folder(conversation_id, folder_id):
        """Move conversation to a folder"""
        if folder_id and isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        return ConversationModel.update(conversation_id, {'folder_id': folder_id})

    @staticmethod
    def move_to_project(conversation_id, project_id):
        """Move conversation to a project (or clear by passing None)."""
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)
        return ConversationModel.update(conversation_id, {'project_id': project_id})

    @staticmethod
    def add_tag(conversation_id, tag):
        """Add a tag to conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {'$addToSet': {'tags': tag}}
        )

    @staticmethod
    def remove_tag(conversation_id, tag):
        """Remove a tag from conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {'$pull': {'tags': tag}}
        )

    @staticmethod
    def toggle_archive(conversation_id, archived=True):
        """Archive or unarchive a conversation"""
        return ConversationModel.update(conversation_id, {'is_archived': archived})

    @staticmethod
    def toggle_pin(conversation_id, pinned=True):
        """Pin or unpin a conversation"""
        return ConversationModel.update(conversation_id, {'is_pinned': pinned})

    @staticmethod
    def increment_message_count(conversation_id, input_tokens=0, output_tokens=0):
        """Increment message count and tokens"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        total_tokens = input_tokens + output_tokens
        return ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {
                '$inc': {
                    'message_count': 1,
                    'token_count.input': input_tokens,
                    'token_count.output': output_tokens,
                    'token_count.total': total_tokens
                },
                '$set': {
                    'last_message_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                }
            }
        )

    @staticmethod
    def delete(conversation_id):
        """Delete a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return ConversationModel.get_collection().delete_one({'_id': conversation_id})

    @staticmethod
    def count_by_user(user_id, archived=False, project_id=None):
        """Count conversations for a user.

        project_id semantics mirror ``find_by_user``:
            None              -> no project filter (legacy behavior)
            NULL_PROJECT_SENTINEL ('__null__') -> filter where project_id is null/missing
            ObjectId / str    -> exact match
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        query = {
            'user_id': user_id,
            'is_archived': archived,
        }
        if project_id == NULL_PROJECT_SENTINEL:
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id
        return ConversationModel.get_collection().count_documents(query)

    @staticmethod
    def get_by_user_for_admin(user_id, skip=0, limit=50):
        """Get all conversations for a user (admin view)"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        cursor = ConversationModel.get_collection().find(
            {'user_id': user_id}
        ).sort('last_message_at', -1).skip(skip).limit(limit)
        return list(cursor)

    @staticmethod
    def add_branch(conversation_id, branch_data):
        """Add a new branch to a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        # Ensure branch has required fields
        branch = {
            'id': branch_data['id'],
            'name': branch_data.get('name', f"Branch {branch_data['id'][:8]}"),
            'parent_branch': branch_data.get('parent_branch', 'main'),
            'branch_point_message_id': branch_data.get('branch_point_message_id'),
            'created_at': datetime.utcnow()
        }

        result = ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {
                '$push': {'branches': branch},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        return result.modified_count > 0

    @staticmethod
    def set_active_branch(conversation_id, branch_id):
        """Set the active branch for a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        result = ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            {
                '$set': {
                    'active_branch': branch_id,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0

    @staticmethod
    def remove_branch(conversation_id, branch_id):
        """Remove a branch from a conversation (cannot remove 'main')"""
        if branch_id == 'main':
            return False

        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        # Get the conversation to check if active branch needs update
        conversation = ConversationModel.find_by_id(conversation_id)
        if not conversation:
            return False

        update_data = {
            '$pull': {'branches': {'id': branch_id}},
            '$set': {'updated_at': datetime.utcnow()}
        }

        # If deleting the active branch, switch to main
        if conversation.get('active_branch') == branch_id:
            update_data['$set']['active_branch'] = 'main'

        result = ConversationModel.get_collection().update_one(
            {'_id': conversation_id},
            update_data
        )
        return result.modified_count > 0

    @staticmethod
    def update_branch_name(conversation_id, branch_id, new_name):
        """Update a branch's name"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        result = ConversationModel.get_collection().update_one(
            {'_id': conversation_id, 'branches.id': branch_id},
            {'$set': {'branches.$.name': new_name}}
        )
        return result.modified_count > 0

    @staticmethod
    def get_branch(conversation_id, branch_id):
        """Get a specific branch from a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        conversation = ConversationModel.find_by_id(conversation_id)
        if not conversation:
            return None

        branches = conversation.get('branches', [])
        for branch in branches:
            if branch['id'] == branch_id:
                return branch
        return None
