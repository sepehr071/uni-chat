from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


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
        collection.create_index([('title', 'text')])

    @staticmethod
    def create(user_id, config_id, title='New conversation', folder_id=None):
        """Create a new conversation"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        # Don't convert quick model IDs to ObjectId - store as string
        if isinstance(config_id, str) and not config_id.startswith('quick:'):
            config_id = ObjectId(config_id)
        if folder_id and isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)

        conversation_doc = {
            'user_id': user_id,
            'config_id': config_id,
            'title': title,
            'folder_id': folder_id,
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
                     skip=0, limit=20, sort_by='last_message_at'):
        """Find conversations for a user"""
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
    def count_by_user(user_id, archived=False):
        """Count conversations for a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return ConversationModel.get_collection().count_documents({
            'user_id': user_id,
            'is_archived': archived
        })

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
