from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class KnowledgeFolderModel:
    """Model for Knowledge Vault folders - organize knowledge items."""

    collection_name = 'knowledge_folders'

    @staticmethod
    def get_collection():
        return mongo.db[KnowledgeFolderModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for knowledge folders."""
        collection = KnowledgeFolderModel.get_collection()
        # Compound index for user queries sorted by order
        collection.create_index([('user_id', 1), ('order', 1)])
        # Unique name per user
        collection.create_index([('user_id', 1), ('name', 1)], unique=True)

    @staticmethod
    def create(user_id: str, name: str, color: str = '#5c9aed') -> dict:
        """
        Create a new knowledge folder.

        Args:
            user_id: Owner user ID
            name: Folder name (max 100 chars)
            color: Hex color for folder icon

        Returns:
            Created document
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Get next order value
        collection = KnowledgeFolderModel.get_collection()
        max_order = collection.find_one(
            {'user_id': user_id},
            sort=[('order', -1)]
        )
        next_order = (max_order['order'] + 1) if max_order else 0

        now = datetime.utcnow()
        doc = {
            'user_id': user_id,
            'name': name[:100],  # Limit to 100 chars
            'color': color,
            'order': next_order,
            'created_at': now,
            'updated_at': now
        }

        result = collection.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_user(user_id: str) -> list:
        """
        List all folders for a user, sorted by order.

        Args:
            user_id: Owner user ID

        Returns:
            List of folder documents
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        cursor = KnowledgeFolderModel.get_collection().find(
            {'user_id': user_id}
        ).sort('order', 1)

        return list(cursor)

    @staticmethod
    def find_by_id(folder_id: str) -> dict:
        """Get a single folder by ID."""
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        return KnowledgeFolderModel.get_collection().find_one({'_id': folder_id})

    @staticmethod
    def update(folder_id: str, user_id: str, updates: dict) -> bool:
        """
        Update a folder.

        Args:
            folder_id: Folder ID to update
            user_id: User ID (for ownership verification)
            updates: Dict with fields to update (name, color)

        Returns:
            True if updated, False if not found or not owned
        """
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Only allow updating specific fields
        allowed_fields = {'name', 'color'}
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return False

        if 'name' in update_data:
            update_data['name'] = update_data['name'][:100]

        update_data['updated_at'] = datetime.utcnow()

        result = KnowledgeFolderModel.get_collection().update_one(
            {'_id': folder_id, 'user_id': user_id},
            {'$set': update_data}
        )

        return result.modified_count > 0

    @staticmethod
    def delete(folder_id: str, user_id: str) -> bool:
        """
        Delete a folder. Items in this folder will have folder_id set to null.

        Args:
            folder_id: Folder ID to delete
            user_id: User ID (for ownership verification)

        Returns:
            True if deleted, False if not found or not owned
        """
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # First, move all items in this folder to root (folder_id = null)
        from app.models.knowledge_item import KnowledgeItemModel
        KnowledgeItemModel.get_collection().update_many(
            {'user_id': user_id, 'folder_id': folder_id},
            {'$set': {'folder_id': None, 'updated_at': datetime.utcnow()}}
        )

        # Then delete the folder
        result = KnowledgeFolderModel.get_collection().delete_one(
            {'_id': folder_id, 'user_id': user_id}
        )

        return result.deleted_count > 0

    @staticmethod
    def reorder(user_id: str, folder_orders: list) -> bool:
        """
        Reorder folders for a user.

        Args:
            user_id: Owner user ID
            folder_orders: List of dicts with folder_id and order

        Returns:
            True if successful
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        collection = KnowledgeFolderModel.get_collection()
        now = datetime.utcnow()

        for item in folder_orders:
            folder_id = ObjectId(item['folder_id']) if isinstance(item['folder_id'], str) else item['folder_id']
            collection.update_one(
                {'_id': folder_id, 'user_id': user_id},
                {'$set': {'order': item['order'], 'updated_at': now}}
            )

        return True

    @staticmethod
    def count_by_user(user_id: str) -> int:
        """Count total folders for a user."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return KnowledgeFolderModel.get_collection().count_documents({'user_id': user_id})

    @staticmethod
    def exists(folder_id: str, user_id: str) -> bool:
        """Check if a folder exists and belongs to user."""
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return KnowledgeFolderModel.get_collection().find_one(
            {'_id': folder_id, 'user_id': user_id}
        ) is not None
