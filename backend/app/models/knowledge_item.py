from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class KnowledgeItemModel:
    """Model for Knowledge Vault items - saved snippets from chat/arena/debate."""

    collection_name = 'knowledge_items'

    @staticmethod
    def get_collection():
        return mongo.db[KnowledgeItemModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for knowledge items."""
        collection = KnowledgeItemModel.get_collection()
        # Compound index for user queries sorted by date
        collection.create_index([('user_id', 1), ('created_at', -1)])
        # Compound index for tag filtering
        collection.create_index([('user_id', 1), ('tags', 1)])
        # Text index for full-text search
        collection.create_index(
            [('content', 'text'), ('title', 'text'), ('notes', 'text')],
            name='knowledge_text_search'
        )

    @staticmethod
    def create(user_id: str, source_type: str, source_id: str, message_id: str,
               content: str, title: str, tags: list = None) -> dict:
        """
        Create a new knowledge item.

        Args:
            user_id: Owner user ID
            source_type: 'chat', 'arena', or 'debate'
            source_id: conversation_id or session_id depending on source_type
            message_id: ID of the original message
            content: The saved content
            title: Title for the item
            tags: Optional list of tag strings

        Returns:
            Created document
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Build source object based on type
        source = {
            'type': source_type,
            'message_id': ObjectId(message_id) if message_id else None
        }

        if source_type == 'chat':
            source['conversation_id'] = ObjectId(source_id) if source_id else None
            source['session_id'] = None
        else:
            # arena or debate
            source['conversation_id'] = None
            source['session_id'] = ObjectId(source_id) if source_id else None

        now = datetime.utcnow()
        doc = {
            'user_id': user_id,
            'source': source,
            'content': content,
            'title': title,
            'tags': tags or [],
            'notes': '',
            'is_favorite': False,
            'created_at': now,
            'updated_at': now
        }

        result = KnowledgeItemModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_user(user_id: str, page: int = 1, limit: int = 20,
                     tag: str = None, favorite_only: bool = False) -> tuple:
        """
        List user's knowledge items with pagination and filtering.

        Args:
            user_id: Owner user ID
            page: Page number (1-indexed)
            limit: Items per page
            tag: Optional tag to filter by
            favorite_only: If True, only return favorites

        Returns:
            Tuple of (items list, total count)
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}

        if tag:
            query['tags'] = tag

        if favorite_only:
            query['is_favorite'] = True

        collection = KnowledgeItemModel.get_collection()
        total = collection.count_documents(query)

        skip = (page - 1) * limit
        cursor = collection.find(query).sort('created_at', -1).skip(skip).limit(limit)

        return list(cursor), total

    @staticmethod
    def find_by_id(item_id: str) -> dict:
        """Get a single knowledge item by ID."""
        if isinstance(item_id, str):
            item_id = ObjectId(item_id)
        return KnowledgeItemModel.get_collection().find_one({'_id': item_id})

    @staticmethod
    def update(item_id: str, user_id: str, updates: dict) -> bool:
        """
        Update a knowledge item.

        Args:
            item_id: Item ID to update
            user_id: User ID (for ownership verification)
            updates: Dict with fields to update (title, tags, notes, is_favorite)

        Returns:
            True if updated, False if not found or not owned
        """
        if isinstance(item_id, str):
            item_id = ObjectId(item_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Only allow updating specific fields
        allowed_fields = {'title', 'tags', 'notes', 'is_favorite'}
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return False

        update_data['updated_at'] = datetime.utcnow()

        result = KnowledgeItemModel.get_collection().update_one(
            {'_id': item_id, 'user_id': user_id},
            {'$set': update_data}
        )

        return result.modified_count > 0

    @staticmethod
    def delete(item_id: str, user_id: str) -> bool:
        """
        Delete a knowledge item.

        Args:
            item_id: Item ID to delete
            user_id: User ID (for ownership verification)

        Returns:
            True if deleted, False if not found or not owned
        """
        if isinstance(item_id, str):
            item_id = ObjectId(item_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        result = KnowledgeItemModel.get_collection().delete_one(
            {'_id': item_id, 'user_id': user_id}
        )

        return result.deleted_count > 0

    @staticmethod
    def search(user_id: str, query: str, page: int = 1, limit: int = 20) -> tuple:
        """
        Full-text search on user's knowledge items.

        Args:
            user_id: Owner user ID
            query: Search query string
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (items list, total count)
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        collection = KnowledgeItemModel.get_collection()

        search_query = {
            'user_id': user_id,
            '$text': {'$search': query}
        }

        total = collection.count_documents(search_query)

        skip = (page - 1) * limit
        cursor = collection.find(
            search_query,
            {'score': {'$meta': 'textScore'}}
        ).sort([('score', {'$meta': 'textScore'})]).skip(skip).limit(limit)

        return list(cursor), total

    @staticmethod
    def get_user_tags(user_id: str) -> list:
        """
        Get distinct tags for a user's knowledge items.

        Args:
            user_id: Owner user ID

        Returns:
            List of unique tag strings
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        return KnowledgeItemModel.get_collection().distinct(
            'tags',
            {'user_id': user_id}
        )

    @staticmethod
    def count_by_user(user_id: str) -> int:
        """Count total knowledge items for a user."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return KnowledgeItemModel.get_collection().count_documents({'user_id': user_id})
