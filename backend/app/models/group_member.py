"""GroupMember model — links users to groups."""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class GroupMemberModel:
    """Model for group memberships - links users to a workspace group."""

    collection_name = 'group_members'

    @staticmethod
    def get_collection():
        return mongo.db[GroupMemberModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for group memberships."""
        collection = GroupMemberModel.get_collection()
        collection.create_index([('group_id', 1), ('user_id', 1)], unique=True)
        collection.create_index([('user_id', 1)])

    @staticmethod
    def add(group_id, user_id, added_by) -> dict:
        """Insert a membership row. Idempotent — returns the existing row when present."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if added_by is not None and isinstance(added_by, str):
            added_by = ObjectId(added_by)

        collection = GroupMemberModel.get_collection()
        existing = collection.find_one({'group_id': group_id, 'user_id': user_id})
        if existing:
            return existing

        doc = {
            'group_id': group_id,
            'user_id': user_id,
            'added_by': added_by,
            'created_at': datetime.utcnow(),
        }
        result = collection.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def remove(group_id, user_id) -> bool:
        """Hard-delete a membership row."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        result = GroupMemberModel.get_collection().delete_one({
            'group_id': group_id,
            'user_id': user_id,
        })
        return result.deleted_count > 0

    @staticmethod
    def find_by_group(group_id) -> list:
        """List all members of a group."""
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        cursor = GroupMemberModel.get_collection().find({'group_id': group_id})
        return list(cursor)

    @staticmethod
    def find_groups_for_user(workspace_id, user_id) -> list:
        """Return the list of group docs this user belongs to within a workspace.

        Joins group_members with groups (filtered by workspace_id).
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        from app.models.group import GroupModel

        # Pull this user's group memberships, then resolve group docs scoped to ws.
        membership_rows = list(
            GroupMemberModel.get_collection().find({'user_id': user_id})
        )
        if not membership_rows:
            return []

        group_ids = [r['group_id'] for r in membership_rows]
        cursor = GroupModel.get_collection().find({
            '_id': {'$in': group_ids},
            'workspace_id': workspace_id,
        })
        return list(cursor)

    @staticmethod
    def is_member(group_id, user_id) -> bool:
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return GroupMemberModel.get_collection().find_one({
            'group_id': group_id,
            'user_id': user_id,
        }) is not None
