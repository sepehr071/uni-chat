"""Group model — workspace-scoped collection of users for project access grants."""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class GroupModel:
    """Model for groups - workspace-scoped roster used by project access grants."""

    collection_name = 'groups'

    @staticmethod
    def get_collection():
        return mongo.db[GroupModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for groups."""
        collection = GroupModel.get_collection()
        collection.create_index([('workspace_id', 1), ('name', 1)], unique=True)
        collection.create_index([('workspace_id', 1)])

    @staticmethod
    def create(workspace_id, name: str, created_by, color: str = '#5c9aed',
               icon: str = None, description: str = None) -> dict:
        """Insert a new group document. Caller is responsible for uniqueness errors.

        Args:
            workspace_id: parent workspace id (str or ObjectId)
            name: display name (unique within the workspace)
            created_by: creator user id (str or ObjectId)
            color: hex color string
            icon: optional icon identifier
            description: optional short description

        Returns:
            The inserted document including ``_id``.
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(created_by, str):
            created_by = ObjectId(created_by)

        now = datetime.utcnow()
        doc = {
            'workspace_id': workspace_id,
            'name': name,
            'color': color,
            'icon': icon,
            'description': description,
            'member_count': 0,
            'created_by': created_by,
            'created_at': now,
            'updated_at': now,
        }
        result = GroupModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(group_id) -> dict:
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        return GroupModel.get_collection().find_one({'_id': group_id})

    @staticmethod
    def find_by_workspace(workspace_id) -> list:
        """List all groups in a workspace, sorted alphabetically."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        cursor = GroupModel.get_collection().find(
            {'workspace_id': workspace_id}
        ).sort([('name', 1)])
        return list(cursor)

    @staticmethod
    def update(group_id, update_data: dict) -> bool:
        """Update whitelisted fields. Returns True if a doc was modified."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)

        allowed_fields = {'name', 'color', 'icon', 'description'}
        clean = {k: v for k, v in (update_data or {}).items() if k in allowed_fields}
        if not clean:
            return False

        clean['updated_at'] = datetime.utcnow()
        result = GroupModel.get_collection().update_one(
            {'_id': group_id},
            {'$set': clean},
        )
        return result.modified_count > 0

    @staticmethod
    def delete(group_id) -> bool:
        """Hard-delete a group. Caller is responsible for cascading membership rows."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        result = GroupModel.get_collection().delete_one({'_id': group_id})
        return result.deleted_count > 0

    @staticmethod
    def count_members(group_id) -> int:
        """Count rows in group_members for this group."""
        from app.models.group_member import GroupMemberModel
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        return GroupMemberModel.get_collection().count_documents({'group_id': group_id})

    @staticmethod
    def recompute_member_count(group_id) -> int:
        """Recount members and persist to ``member_count``. Returns the new count."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        count = GroupModel.count_members(group_id)
        GroupModel.get_collection().update_one(
            {'_id': group_id},
            {'$set': {'member_count': count, 'updated_at': datetime.utcnow()}},
        )
        return count
