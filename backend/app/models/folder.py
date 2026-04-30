from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


# Sentinel string the route layer translates `?project_id=null` into. Lets
# callers distinguish "no filter" (None) from "filter where project_id is
# null/missing" (the sentinel).
NULL_PROJECT_SENTINEL = '__null__'


class FolderModel:
    collection_name = 'folders'

    @staticmethod
    def get_collection():
        return mongo.db[FolderModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = FolderModel.get_collection()
        # Legacy indexes (kept for backward compat — additive, not replaced).
        collection.create_index([('user_id', 1), ('parent_id', 1)])
        collection.create_index([('user_id', 1), ('order', 1)])
        # Project-scoped compound indexes.
        collection.create_index([('user_id', 1), ('project_id', 1), ('parent_id', 1)])
        collection.create_index([('user_id', 1), ('project_id', 1), ('order', 1)])

    @staticmethod
    def create(user_id, name, color='#5c9aed', icon=None, parent_id=None,
               project_id=None):
        """Create a new folder"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if parent_id and isinstance(parent_id, str):
            parent_id = ObjectId(parent_id)
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)

        # Get the next order number (scoped to same parent + project).
        last_folder = FolderModel.get_collection().find_one(
            {'user_id': user_id, 'parent_id': parent_id, 'project_id': project_id},
            sort=[('order', -1)]
        )
        order = (last_folder['order'] + 1) if last_folder else 0

        folder_doc = {
            'user_id': user_id,
            'name': name,
            'color': color,
            'icon': icon,
            'parent_id': parent_id,
            'project_id': project_id,
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
    def find_by_user(user_id, parent_id=None, project_id=None):
        """Find folders for a user.

        project_id semantics:
            None              -> no project filter (legacy behavior preserved)
            NULL_PROJECT_SENTINEL ('__null__') -> filter where project_id is null/missing
            ObjectId / str    -> exact match
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}
        if parent_id:
            if isinstance(parent_id, str):
                parent_id = ObjectId(parent_id)
            query['parent_id'] = parent_id
        else:
            query['parent_id'] = None

        if project_id == NULL_PROJECT_SENTINEL:
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id

        cursor = FolderModel.get_collection().find(query).sort('order', 1)
        return list(cursor)

    @staticmethod
    def find_all_by_user(user_id, project_id=None):
        """Find all folders for a user (flat list).

        project_id semantics match `find_by_user`.
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}
        if project_id == NULL_PROJECT_SENTINEL:
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id

        cursor = FolderModel.get_collection().find(query).sort('order', 1)
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
    def move_to_project(folder_id, project_id):
        """Move folder to a project (or clear by passing None)."""
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)
        return FolderModel.update(folder_id, {'project_id': project_id})

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
