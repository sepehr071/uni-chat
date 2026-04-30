from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


# Sentinel string the route layer translates `?project_id=null` into. Lets
# callers distinguish "no filter" (None) from "filter where project_id is
# null/missing" (the sentinel).
NULL_PROJECT_SENTINEL = '__null__'


class KnowledgeFolderModel:
    """Model for Knowledge Vault folders - organize knowledge items."""

    collection_name = 'knowledge_folders'

    @staticmethod
    def get_collection():
        return mongo.db[KnowledgeFolderModel.collection_name]

    @staticmethod
    def _compute_scope_key(user_id, project_id) -> str:
        """Build the scope_key used by the unique (scope_key, name) index.

        Project-scoped folders share their project's namespace; un-scoped
        folders are isolated per user using a `u:<oid>` prefix.
        """
        if project_id:
            return str(project_id)
        return f'u:{str(user_id)}'

    @staticmethod
    def create_indexes():
        """Create necessary indexes for knowledge folders.

        On first run after the migrate_resource_scoping script the legacy
        `(user_id, name)` UNIQUE index is dropped; we (defensively) drop it
        here too so dev environments that never ran the migration don't fail
        when create_indexes runs at startup.
        """
        collection = KnowledgeFolderModel.get_collection()

        # Compound index for user queries sorted by order.
        collection.create_index([('user_id', 1), ('order', 1)])
        # Project-scoped index for project listings.
        collection.create_index([('project_id', 1), ('order', 1)])

        # Drop legacy UNIQUE (user_id, name) if it still exists. The new
        # constraint lives on (scope_key, name).
        try:
            existing = collection.index_information()
        except Exception:
            existing = {}

        for idx_name, idx_info in existing.items():
            if idx_info.get('unique') and idx_info.get('key') == [('user_id', 1), ('name', 1)]:
                try:
                    collection.drop_index(idx_name)
                except Exception:
                    pass

        # Unique name per scope (project, or per-user if unscoped).
        collection.create_index([('scope_key', 1), ('name', 1)], unique=True)

    @staticmethod
    def create(user_id: str, name: str, color: str = '#5c9aed',
               project_id=None, workspace_id=None) -> dict:
        """
        Create a new knowledge folder.

        Args:
            user_id: Owner user ID
            name: Folder name (max 100 chars)
            color: Hex color for folder icon
            project_id: Optional project this folder belongs to.
            workspace_id: Optional workspace (must match project's workspace
                when project_id is set; route layer derives this).

        Returns:
            Created document
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if workspace_id and isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)

        # Get next order value (scoped per user — order is cosmetic).
        collection = KnowledgeFolderModel.get_collection()
        max_order = collection.find_one(
            {'user_id': user_id},
            sort=[('order', -1)]
        )
        next_order = (max_order['order'] + 1) if max_order else 0

        scope_key = KnowledgeFolderModel._compute_scope_key(user_id, project_id)

        now = datetime.utcnow()
        doc = {
            'user_id': user_id,
            'name': name[:100],  # Limit to 100 chars
            'color': color,
            'order': next_order,
            'project_id': project_id,
            'workspace_id': workspace_id,
            'scope_key': scope_key,
            'created_at': now,
            'updated_at': now
        }

        result = collection.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_user(user_id: str, project_id=None) -> list:
        """
        List folders for a user, sorted by order.

        project_id semantics:
            None                                -> no project filter (legacy)
            NULL_PROJECT_SENTINEL ('__null__')  -> only un-scoped folders
            'null'                              -> alias of the sentinel
            ObjectId / str                      -> exact match

        Args:
            user_id: Owner user ID
            project_id: Optional project filter

        Returns:
            List of folder documents
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}

        if project_id == NULL_PROJECT_SENTINEL or project_id == 'null':
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id

        cursor = KnowledgeFolderModel.get_collection().find(query).sort('order', 1)

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

        Raises:
            ValueError('cannot_reassign_project'): Caller attempted to mutate
                project_id; reassignment is not supported.
            ValueError('duplicate_name'): A folder with the new name already
                exists in the same scope.
        """
        if isinstance(folder_id, str):
            folder_id = ObjectId(folder_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Refuse project_id reassignment — see route-layer policy.
        if 'project_id' in updates:
            raise ValueError('cannot_reassign_project')

        # Only allow updating specific fields
        allowed_fields = {'name', 'color'}
        update_data = {k: v for k, v in updates.items() if k in allowed_fields}

        if not update_data:
            return False

        if 'name' in update_data:
            update_data['name'] = update_data['name'][:100]

            # Pre-flight collision check under the same scope_key.
            current = KnowledgeFolderModel.get_collection().find_one(
                {'_id': folder_id, 'user_id': user_id}
            )
            if not current:
                return False
            scope_key = current.get('scope_key') or KnowledgeFolderModel._compute_scope_key(
                current['user_id'], current.get('project_id')
            )
            collision = KnowledgeFolderModel.get_collection().find_one({
                'scope_key': scope_key,
                'name': update_data['name'],
                '_id': {'$ne': folder_id},
            })
            if collision:
                raise ValueError('duplicate_name')

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
