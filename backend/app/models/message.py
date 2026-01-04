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
        collection.create_index([('content', 'text')])

    @staticmethod
    def create(conversation_id, role, content, attachments=None, metadata=None):
        """Create a new message"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        message_doc = {
            'conversation_id': conversation_id,
            'role': role,  # 'user', 'assistant', 'system'
            'content': content,
            'attachments': attachments or [],
            'metadata': metadata or {},
            'is_error': False,
            'error_message': None,
            'created_at': datetime.utcnow()
        }

        result = MessageModel.get_collection().insert_one(message_doc)
        message_doc['_id'] = result.inserted_id
        return message_doc

    @staticmethod
    def create_user_message(conversation_id, content, attachments=None):
        """Create a user message"""
        return MessageModel.create(
            conversation_id=conversation_id,
            role='user',
            content=content,
            attachments=attachments
        )

    @staticmethod
    def create_assistant_message(conversation_id, content, model_id=None,
                                  prompt_tokens=0, completion_tokens=0,
                                  generation_time_ms=0, finish_reason='stop'):
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
            metadata=metadata
        )

    @staticmethod
    def create_error_message(conversation_id, error_message, model_id=None):
        """Create an error message"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        message_doc = {
            'conversation_id': conversation_id,
            'role': 'assistant',
            'content': '',
            'attachments': [],
            'metadata': {'model_id': model_id},
            'is_error': True,
            'error_message': error_message,
            'created_at': datetime.utcnow()
        }

        result = MessageModel.get_collection().insert_one(message_doc)
        message_doc['_id'] = result.inserted_id
        return message_doc

    @staticmethod
    def find_by_conversation(conversation_id, skip=0, limit=100):
        """Get messages for a conversation"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        cursor = MessageModel.get_collection().find(
            {'conversation_id': conversation_id}
        ).sort('created_at', 1).skip(skip).limit(limit)

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
    def get_context_messages(conversation_id, limit=20):
        """Get recent messages for context (for AI)"""
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)

        # Get last N messages
        cursor = MessageModel.get_collection().find(
            {'conversation_id': conversation_id, 'is_error': False}
        ).sort('created_at', -1).limit(limit)

        messages = list(cursor)
        messages.reverse()  # Return in chronological order
        return messages
