from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


# Sentinel string the route layer translates `?project_id=null` into. Lets
# callers distinguish "no filter" (None) from "filter where project_id is
# null/missing" (the sentinel).
NULL_PROJECT_SENTINEL = '__null__'


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
        # Compound index for folder filtering
        collection.create_index([('user_id', 1), ('folder_id', 1), ('created_at', -1)])
        # Project-scoped index — additive, legacy ones above untouched.
        collection.create_index([('project_id', 1), ('created_at', -1)])
        # Text index for full-text search
        collection.create_index(
            [('content', 'text'), ('title', 'text'), ('notes', 'text')],
            name='knowledge_text_search'
        )

    @staticmethod
    def create(user_id: str, source_type: str, source_id: str = None, message_id: str = None,
               content: str = '', title: str = '', tags: list = None, folder_id: str = None,
               project_id=None, workspace_id=None,
               workflow_id: str = None, node_id: str = None) -> dict:
        """
        Create a new knowledge item.

        Args:
            user_id: Owner user ID
            source_type: 'chat', 'arena', 'debate', or 'workflow'
            source_id: conversation_id or session_id (chat/arena/debate only)
            message_id: ID of the original message (chat/arena/debate only)
            content: The saved content
            title: Title for the item
            tags: Optional list of tag strings
            folder_id: Optional folder ID
            project_id: Optional project this item belongs to.
            workspace_id: Optional workspace (route layer derives this from
                the project when project_id is set).
            workflow_id: Workflow ID (workflow source only).
            node_id: Node ID within the workflow (workflow source only).

        Returns:
            Created document
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if project_id and isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if workspace_id and isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)

        if source_type == 'workflow':
            # Workflow outputs aren't tied to a chat/arena/debate message.
            source = {
                'type': 'workflow',
                'workflow_id': ObjectId(workflow_id) if workflow_id else None,
                'node_id': node_id or None,
                'message_id': None,
                'conversation_id': None,
                'session_id': None,
            }
        elif source_type == 'routine':
            # Scheduler-generated knowledge — source_id is the routine doc id.
            source = {
                'type': 'routine',
                'routine_id': ObjectId(source_id) if source_id else None,
                'message_id': None,
                'conversation_id': None,
                'session_id': None,
            }
        else:
            source = {
                'type': source_type,
                'message_id': ObjectId(message_id) if message_id else None
            }
            if source_type == 'chat':
                source['conversation_id'] = ObjectId(source_id) if source_id else None
                source['session_id'] = None
            else:
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
            'folder_id': ObjectId(folder_id) if folder_id else None,
            'project_id': project_id,
            'workspace_id': workspace_id,
            'created_at': now,
            'updated_at': now
        }

        result = KnowledgeItemModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_user(user_id: str, page: int = 1, limit: int = 20,
                     tag: str = None, favorite_only: bool = False,
                     folder_id: str = None, project_id=None) -> tuple:
        """
        List user's knowledge items with pagination and filtering.

        project_id semantics:
            None                                -> no project filter (legacy)
            NULL_PROJECT_SENTINEL ('__null__')  -> only un-scoped items
            'null'                              -> alias of the sentinel
            ObjectId / str                      -> exact match

        Args:
            user_id: Owner user ID
            page: Page number (1-indexed)
            limit: Items per page
            tag: Optional tag to filter by
            favorite_only: If True, only return favorites
            folder_id: Optional folder ID to filter by ('root' for unfiled items)
            project_id: Optional project filter

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

        if folder_id is not None:
            if folder_id == 'root':
                # Items without a folder
                query['$or'] = [{'folder_id': None}, {'folder_id': {'$exists': False}}]
            else:
                query['folder_id'] = ObjectId(folder_id)

        if project_id == NULL_PROJECT_SENTINEL or project_id == 'null':
            query['project_id'] = None
        elif project_id is not None:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query['project_id'] = project_id

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

        Raises:
            ValueError('cannot_reassign_project'): Direct mutation of
                project_id is refused; route layer pipes project changes via
                folder moves only.
        """
        if isinstance(item_id, str):
            item_id = ObjectId(item_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Refuse direct project reassignment — folder moves at the route
        # layer are the supported path for changing project_id.
        if 'project_id' in updates:
            raise ValueError('cannot_reassign_project')

        # Only allow updating specific fields
        allowed_fields = {'title', 'tags', 'notes', 'is_favorite', 'folder_id'}
        update_data = {}
        for k, v in updates.items():
            if k not in allowed_fields:
                continue
            if k == 'folder_id':
                # Convert folder_id to ObjectId or None
                update_data[k] = ObjectId(v) if v else None
            else:
                update_data[k] = v

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

    @staticmethod
    def count_by_folder(user_id: str, folder_id: str = None) -> int:
        """Count knowledge items in a folder."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        query = {'user_id': user_id}
        if folder_id is None or folder_id == 'root':
            query['$or'] = [{'folder_id': None}, {'folder_id': {'$exists': False}}]
        else:
            query['folder_id'] = ObjectId(folder_id)

        return KnowledgeItemModel.get_collection().count_documents(query)

    @staticmethod
    def move_to_folder(item_ids: list, user_id: str, folder_id: str = None,
                       sync_project: bool = False, project_id=None,
                       workspace_id=None) -> int:
        """
        Move knowledge items to a folder.

        Items follow folder scope: when the route layer detects the target
        folder lives under a different project it passes `sync_project=True`
        with the new project_id + workspace_id (either may be None to
        explicitly clear) so the items inherit the folder's scope.

        Args:
            item_ids: List of item IDs to move
            user_id: User ID (for ownership verification)
            folder_id: Target folder ID (None for root/unfiled)
            sync_project: When True, also set project_id + workspace_id
                on moved items (using the values below — None clears).
            project_id: New project_id to apply when sync_project=True.
                None => unset (set to null).
            workspace_id: New workspace_id to apply when sync_project=True.
                None => unset (set to null).

        Returns:
            Number of items moved
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        object_ids = [ObjectId(id) if isinstance(id, str) else id for id in item_ids]
        new_folder_id = ObjectId(folder_id) if folder_id else None

        update_fields = {
            'folder_id': new_folder_id,
            'updated_at': datetime.utcnow(),
        }
        if sync_project:
            if project_id and isinstance(project_id, str):
                project_id = ObjectId(project_id)
            if workspace_id and isinstance(workspace_id, str):
                workspace_id = ObjectId(workspace_id)
            update_fields['project_id'] = project_id  # may be None
            update_fields['workspace_id'] = workspace_id  # may be None

        result = KnowledgeItemModel.get_collection().update_many(
            {'_id': {'$in': object_ids}, 'user_id': user_id},
            {'$set': update_fields}
        )

        return result.modified_count
