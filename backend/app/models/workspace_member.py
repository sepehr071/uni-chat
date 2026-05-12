from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


# Role hierarchy used to evaluate permissions: higher number == more access.
ROLE_HIERARCHY = {
    'viewer': 1,
    'editor': 2,
    'owner': 3,
}

# Set of valid role strings — useful for input validation.
VALID_ROLES = set(ROLE_HIERARCHY.keys())

# DEPRECATED: kept for one-release transition. Callers should use 'owner' directly.
BILLING_ROLES = {'owner'}
ADMIN_ROLES = {'owner'}


class WorkspaceMemberModel:
    """Model for workspace memberships - links users to workspaces with a role."""

    collection_name = 'workspace_members'

    @staticmethod
    def get_collection():
        return mongo.db[WorkspaceMemberModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for workspace memberships."""
        collection = WorkspaceMemberModel.get_collection()
        collection.create_index(
            [('workspace_id', 1), ('user_id', 1)],
            unique=True,
        )
        collection.create_index([('user_id', 1), ('status', 1)])

    @staticmethod
    def add(workspace_id, user_id, role: str, invited_by=None,
            invited_email: str = None, status: str = 'active') -> dict:
        """
        Insert a membership row. Idempotent: if a row already exists for
        (workspace_id, user_id), it is returned unchanged.

        Args:
            workspace_id: target workspace
            user_id: member user
            role: 'owner' | 'editor' | 'viewer'
            invited_by: user id of the inviter (optional)
            invited_email: email used for the invite (may differ from user.email)
            status: 'pending' | 'active' | 'revoked'

        Returns:
            The membership document (existing or newly inserted).
        """
        if role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {role}")
        if status not in ('pending', 'active', 'revoked'):
            raise ValueError(f"Invalid status: {status}")

        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if invited_by is not None and isinstance(invited_by, str):
            invited_by = ObjectId(invited_by)

        collection = WorkspaceMemberModel.get_collection()
        existing = collection.find_one({'workspace_id': workspace_id, 'user_id': user_id})
        if existing:
            return existing

        now = datetime.utcnow()
        doc = {
            'workspace_id': workspace_id,
            'user_id': user_id,
            'role': role,
            'invited_by': invited_by,
            'invited_email': invited_email,
            'status': status,
            'joined_at': now if status == 'active' else None,
            'created_at': now,
        }
        result = collection.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find(workspace_id, user_id) -> dict:
        """Return a single membership doc for (workspace, user) or None."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return WorkspaceMemberModel.get_collection().find_one({
            'workspace_id': workspace_id,
            'user_id': user_id,
        })

    @staticmethod
    def find_by_workspace(workspace_id, status='active') -> list:
        """List members of a workspace filtered by status.

        `status` accepts either a string or a list/tuple of strings, in which
        case the query uses ``$in`` so callers can fetch active+pending in one
        round-trip (P2.35).
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(status, (list, tuple, set)):
            status_filter = {'$in': list(status)}
        else:
            status_filter = status
        cursor = WorkspaceMemberModel.get_collection().find({
            'workspace_id': workspace_id,
            'status': status_filter,
        })
        return list(cursor)

    @staticmethod
    def find_by_user(user_id, status: str = 'active') -> list:
        """List memberships across workspaces for a given user, filtered by status."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        cursor = WorkspaceMemberModel.get_collection().find({
            'user_id': user_id,
            'status': status,
        })
        return list(cursor)

    @staticmethod
    def update_role(workspace_id, user_id, role: str) -> bool:
        """Update the role of a membership. Whitelisted to 'role' only."""
        if role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {role}")
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        result = WorkspaceMemberModel.get_collection().update_one(
            {'workspace_id': workspace_id, 'user_id': user_id},
            {'$set': {'role': role}},
        )
        return result.modified_count > 0

    @staticmethod
    def update_status(workspace_id, user_id, status: str) -> bool:
        """Update membership status. Sets joined_at when transitioning to 'active'."""
        if status not in ('pending', 'active', 'revoked'):
            raise ValueError(f"Invalid status: {status}")
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        update = {'status': status}
        if status == 'active':
            update['joined_at'] = datetime.utcnow()

        result = WorkspaceMemberModel.get_collection().update_one(
            {'workspace_id': workspace_id, 'user_id': user_id},
            {'$set': update},
        )
        return result.modified_count > 0

    @staticmethod
    def remove(workspace_id, user_id) -> bool:
        """Hard-delete a membership row."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        result = WorkspaceMemberModel.get_collection().delete_one({
            'workspace_id': workspace_id,
            'user_id': user_id,
        })
        return result.deleted_count > 0

    @staticmethod
    def count_owners(workspace_id) -> int:
        """Count active owners of a workspace. Used to enforce 'last owner' invariant."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        return WorkspaceMemberModel.get_collection().count_documents({
            'workspace_id': workspace_id,
            'role': 'owner',
            'status': 'active',
        })
