"""
MongoDB Index Setup Script
Run this script to create necessary indexes for optimal performance
"""
from pymongo import MongoClient, ASCENDING, DESCENDING, TEXT
import os


def setup_indexes(db):
    """Create all necessary indexes"""

    # Users collection
    db.users.create_index('email', unique=True)
    db.users.create_index('created_at', sparse=True)
    db.users.create_index([('profile.display_name', TEXT)], sparse=True)
    db.users.create_index('status.is_banned', sparse=True)
    db.users.create_index('usage.last_active', sparse=True)
    print('Created indexes for users collection')

    # Conversations collection
    db.conversations.create_index([('user_id', ASCENDING), ('updated_at', DESCENDING)])
    db.conversations.create_index([('user_id', ASCENDING), ('status', ASCENDING)])
    db.conversations.create_index([('folder_id', ASCENDING)])
    db.conversations.create_index('created_at', sparse=True)
    db.conversations.create_index([('title', TEXT)], sparse=True)
    print('Created indexes for conversations collection')

    # Messages collection
    db.messages.create_index([('conversation_id', ASCENDING), ('created_at', ASCENDING)])
    db.messages.create_index([('conversation_id', ASCENDING), ('role', ASCENDING)])
    db.messages.create_index([('content', TEXT)], sparse=True)
    db.messages.create_index('created_at', sparse=True)
    print('Created indexes for messages collection')

    # LLM Configs collection
    db.llm_configs.create_index([('owner_id', ASCENDING), ('updated_at', DESCENDING)])
    db.llm_configs.create_index('visibility', sparse=True)
    db.llm_configs.create_index([('name', TEXT), ('description', TEXT)], sparse=True)
    print('Created indexes for llm_configs collection')

    # Folders collection
    db.folders.create_index([('user_id', ASCENDING), ('order', ASCENDING)])
    db.folders.create_index([('user_id', ASCENDING), ('name', ASCENDING)], unique=True)
    print('Created indexes for folders collection')

    # Usage logs collection
    db.usage_logs.create_index([('user_id', ASCENDING), ('created_at', DESCENDING)])
    db.usage_logs.create_index([('model_id', ASCENDING), ('created_at', DESCENDING)])
    db.usage_logs.create_index('conversation_id', sparse=True)
    db.usage_logs.create_index('created_at', sparse=True)
    print('Created indexes for usage_logs collection')

    # Audit logs collection
    db.audit_logs.create_index([('action', ASCENDING), ('created_at', DESCENDING)])
    db.audit_logs.create_index([('admin_id', ASCENDING), ('created_at', DESCENDING)])
    db.audit_logs.create_index('created_at', sparse=True)
    print('Created indexes for audit_logs collection')

    print('\nAll indexes created successfully!')


if __name__ == '__main__':
    mongo_uri = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    db_name = mongo_uri.split('/')[-1].split('?')[0]
    db = client[db_name]

    print(f'Setting up indexes for database: {db_name}')
    setup_indexes(db)
