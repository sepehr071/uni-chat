from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class FolderModel:
    collection_name = 'folders'

    @staticmethod
    def get_collection():
        return mongo.db[FolderModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = FolderModel.get_collection()
        collection.create_index([('user_id', 1), ('parent_id', 1)])
        collection.create_index([('user_id', 1), ('order', 1)])

    @staticmethod
    def create(user_id, name, color='#5c9aed', icon=None, parent_id=None):
        """Create a new folder"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if parent_id and isinstance(parent_id, str):
            parent_id = ObjectId(parent_id)

        # Get the next order number
        last_folder = FolderModel.get_collection().find_one(
            {'user_id': user_id, 'parent_id': parent_id},
            sort=[('order', -1)]
        )
        order = (last_folder['order'] + 1) if last_folder else 0

        folder_doc = {
            'user_id': user_id,
            'name': name,
            'color': color,
            'icon': icon,
            'parent_id': parent_id,
            'order': order,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = FolderModel.get_collection().insert_one(folder_doc)
        folder_doc['_id'] = result.inserted_id
        return folder_doc

    @staticmethod
    def find_by_id(folder_id):
        """Find folder by ID"""
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        return FolderModel.get_collection().find_one({'_id': folder_id})

    @staticmethod
    def find_by_user(user_id, parent_id=None):
        """Find folders for a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}
        if parent_id:
            if isinstance(parent_id, str):
                parent_id = ObjectId(parent_id)
            query['parent_id'] = parent_id
        else:
            query['parent_id'] = None

        cursor = FolderModel.get_collection().find(query).sort('order', 1)
        return list(cursor)

    @staticmethod
    def find_all_by_user(user_id):
        """Find all folders for a user (flat list)"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        cursor = FolderModel.get_collection().find(
            {'user_id': user_id}
        ).sort('order', 1)

        return list(cursor)

    @staticmethod
    def update(folder_id, update_data):
        """Update folder"""
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        update_data['updated_at'] = datetime.utcnow()
        return FolderModel.get_collection().update_one(
            {'_id': folder_id},
            {'$set': update_data}
        )

    @staticmethod
    def reorder(user_id, folder_orders):
        """
        Reorder folders
        folder_orders: list of {id: folder_id, order: new_order}
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        for item in folder_orders:
            folder_id = ObjectId(item['id']) if isinstance(item['id'], str) else item['id']
            FolderModel.get_collection().update_one(
                {'_id': folder_id, 'user_id': user_id},
                {'$set': {'order': item['order'], 'updated_at': datetime.utcnow()}}
            )

    @staticmethod
    def delete(folder_id):
        """Delete a folder"""
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        return FolderModel.get_collection().delete_one({'_id': folder_id})

    @staticmethod
    def delete_by_user(user_id):
        """Delete all folders for a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return FolderModel.get_collection().delete_many({'user_id': user_id})

    @staticmethod
    def count_by_user(user_id):
        """Count folders for a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return FolderModel.get_collection().count_documents({'user_id': user_id})
