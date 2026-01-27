from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class MessageModel:
    collection_name = 'messages'

    @staticmethod
    def get_collection():
        return mongo.db[MessageModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = MessageModel.get_collection()
        collection.create_index([('conversation_id', 1), ('created_at', 1)])
        collection.create_index([('conversation_id', 1), ('branch_id', 1), ('created_at', 1)])
        collection.create_index([('content', 'text')])

    @staticmethod
    def create(conversation_id, role, content, attachments=None, metadata=None, branch_id='main'):
        """Create a new message"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        message_doc = {
            'conversation_id': conversation_id,
            'role': role,  # 'user', 'assistant', 'system'
            'content': content,
            'attachments': attachments or [],
            'metadata': metadata or {},
            'branch_id': branch_id,
            'is_error': False,
            'error_message': None,
            'created_at': datetime.utcnow()
        }

        result = MessageModel.get_collection().insert_one(message_doc)
        message_doc['_id'] = result.inserted_id
        return message_doc

    @staticmethod
    def create_user_message(conversation_id, content, attachments=None, branch_id='main'):
        """Create a user message"""
        return MessageModel.create(
            conversation_id=conversation_id,
            role='user',
            content=content,
            attachments=attachments,
            branch_id=branch_id
        )

    @staticmethod
    def create_assistant_message(conversation_id, content, model_id=None,
                                  prompt_tokens=0, completion_tokens=0,
                                  generation_time_ms=0, finish_reason='stop',
                                  branch_id='main'):
        """Create an assistant message"""
        metadata = {
            'model_id': model_id,
            'tokens': {
                'prompt': prompt_tokens,
                'completion': completion_tokens
            },
            'generation_time_ms': generation_time_ms,
            'finish_reason': finish_reason
        }
        return MessageModel.create(
            conversation_id=conversation_id,
            role='assistant',
            content=content,
            metadata=metadata,
            branch_id=branch_id
        )

    @staticmethod
    def create_error_message(conversation_id, error_message, model_id=None, branch_id='main'):
        """Create an error message"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        message_doc = {
            'conversation_id': conversation_id,
            'role': 'assistant',
            'content': '',
            'attachments': [],
            'metadata': {'model_id': model_id},
            'branch_id': branch_id,
            'is_error': True,
            'error_message': error_message,
            'created_at': datetime.utcnow()
        }

        result = MessageModel.get_collection().insert_one(message_doc)
        message_doc['_id'] = result.inserted_id
        return message_doc

    @staticmethod
    def find_by_conversation(conversation_id, skip=0, limit=100, branch_id=None):
        """Get messages for a conversation, optionally filtered by branch"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        query = {'conversation_id': conversation_id}
        if branch_id is not None:
            # Match messages with this branch_id OR messages without branch_id (legacy)
            # Legacy messages (without branch_id) are treated as 'main' branch
            if branch_id == 'main':
                query['$or'] = [
                    {'branch_id': 'main'},
                    {'branch_id': {'$exists': False}}
                ]
            else:
                query['branch_id'] = branch_id

        cursor = MessageModel.get_collection().find(query).sort('created_at', 1).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def find_by_id(message_id):
        """Find message by ID"""
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)
        return MessageModel.get_collection().find_one({'_id': message_id})

    @staticmethod
    def update_content(message_id, content):
        """Update message content (for streaming)"""
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)
        return MessageModel.get_collection().update_one(
            {'_id': message_id},
            {'$set': {'content': content}}
        )

    @staticmethod
    def update_with_edit_history(message_id, content, edit_history):
        """Update message content and store edit history"""
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)
        return MessageModel.get_collection().update_one(
            {'_id': message_id},
            {
                '$set': {
                    'content': content,
                    'edit_history': edit_history,
                    'is_edited': True,
                    'edited_at': datetime.utcnow()
                }
            }
        )

    @staticmethod
    def update_metadata(message_id, metadata):
        """Update message metadata"""
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)
        return MessageModel.get_collection().update_one(
            {'_id': message_id},
            {'$set': {'metadata': metadata}}
        )

    @staticmethod
    def delete(message_id):
        """Delete a message"""
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)
        return MessageModel.get_collection().delete_one({'_id': message_id})

    @staticmethod
    def delete_by_conversation(conversation_id):
        """Delete all messages in a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return MessageModel.get_collection().delete_many({'conversation_id': conversation_id})

    @staticmethod
    def count_by_conversation(conversation_id):
        """Count messages in a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        return MessageModel.get_collection().count_documents({'conversation_id': conversation_id})

    @staticmethod
    def get_context_messages(conversation_id, limit=20, branch_id=None):
        """Get recent messages for context (for AI)"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        query = {'conversation_id': conversation_id, 'is_error': False}
        if branch_id is not None:
            # Match messages with this branch_id OR messages without branch_id (legacy)
            if branch_id == 'main':
                query['$or'] = [
                    {'branch_id': 'main'},
                    {'branch_id': {'$exists': False}}
                ]
            else:
                query['branch_id'] = branch_id

        # Get last N messages
        cursor = MessageModel.get_collection().find(query).sort('created_at', -1).limit(limit)

        messages = list(cursor)
        messages.reverse()  # Return in chronological order
        return messages

    @staticmethod
    def search_in_conversations(user_conversation_ids, query, limit=50):
        """
        Search for messages containing the query text within user's conversations.
        Returns messages grouped by conversation with relevance scores.
        """
        if not query or not user_conversation_ids:
            return []

        # Convert string IDs to ObjectId
        conv_ids = [ObjectId(cid) if isinstance(cid, str) else cid for cid in user_conversation_ids]

        # Use MongoDB text search with aggregation
        pipeline = [
            {
                '$match': {
                    'conversation_id': {'$in': conv_ids},
                    '$text': {'$search': query}
                }
            },
            {
                '$addFields': {
                    'score': {'$meta': 'textScore'}
                }
            },
            {
                '$sort': {'score': -1, 'created_at': -1}
            },
            {
                '$limit': limit
            },
            {
                '$lookup': {
                    'from': 'conversations',
                    'localField': 'conversation_id',
                    'foreignField': '_id',
                    'as': 'conversation'
                }
            },
            {
                '$unwind': '$conversation'
            },
            {
                '$project': {
                    '_id': 1,
                    'conversation_id': 1,
                    'role': 1,
                    'content': 1,
                    'created_at': 1,
                    'score': 1,
                    'conversation_title': '$conversation.title'
                }
            }
        ]

        results = list(MessageModel.get_collection().aggregate(pipeline))
        return results

    @staticmethod
    def delete_after_message(conversation_id, message_id, branch_id=None):
        """Delete all messages after a specific message in a conversation (for edit/regenerate)"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)

        # Get the message to find its timestamp
        message = MessageModel.find_by_id(message_id)
        if not message:
            return 0

        query = {
            'conversation_id': conversation_id,
            'created_at': {'$gt': message['created_at']}
        }
        if branch_id is not None:
            # Match messages with this branch_id OR messages without branch_id (legacy)
            if branch_id == 'main':
                query['$or'] = [
                    {'branch_id': 'main'},
                    {'branch_id': {'$exists': False}}
                ]
            else:
                query['branch_id'] = branch_id

        # Delete all messages after this one
        result = MessageModel.get_collection().delete_many(query)
        return result.deleted_count

    @staticmethod
    def find_up_to(conversation_id, message_id, branch_id='main'):
        """Get all messages up to and including a specific message in a branch"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)

        # Get the target message to find its timestamp
        message = MessageModel.find_by_id(message_id)
        if not message:
            return []

        # Build query with legacy support for main branch
        query = {
            'conversation_id': conversation_id,
            'created_at': {'$lte': message['created_at']}
        }
        if branch_id == 'main':
            query['$or'] = [
                {'branch_id': 'main'},
                {'branch_id': {'$exists': False}}
            ]
        else:
            query['branch_id'] = branch_id

        cursor = MessageModel.get_collection().find(query).sort('created_at', 1)

        return list(cursor)

    @staticmethod
    def copy_to_branch(message, new_branch_id):
        """Copy a message to a new branch"""
        # Create a copy of the message with the new branch_id
        message_doc = {
            'conversation_id': message['conversation_id'],
            'role': message['role'],
            'content': message['content'],
            'attachments': message.get('attachments', []),
            'metadata': message.get('metadata', {}),
            'branch_id': new_branch_id,
            'is_error': message.get('is_error', False),
            'error_message': message.get('error_message'),
            'created_at': message['created_at']  # Preserve original timestamp
        }

        # Copy optional fields if they exist
        if message.get('is_edited'):
            message_doc['is_edited'] = message['is_edited']
        if message.get('edit_history'):
            message_doc['edit_history'] = message['edit_history']
        if message.get('edited_at'):
            message_doc['edited_at'] = message['edited_at']

        result = MessageModel.get_collection().insert_one(message_doc)
        message_doc['_id'] = result.inserted_id
        return message_doc

    @staticmethod
    def delete_by_branch(conversation_id, branch_id):
        """Delete all messages in a specific branch"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        result = MessageModel.get_collection().delete_many({
            'conversation_id': conversation_id,
            'branch_id': branch_id
        })
        return result.deleted_count
