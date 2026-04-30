import secrets
from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


# Pending workspace invites expire after 7 days.
INVITE_TTL_DAYS = 7


class WorkspaceInviteModel:
    """Pending email invites to join a workspace.

    TTL via partial index: only docs with `accepted_at: None` are eligible for auto-expiry,
    so accepted invites remain as historical records.
    """

    collection_name = 'workspace_invites'

    @staticmethod
    def get_collection():
        return mongo.db[WorkspaceInviteModel.collection_name]

    @staticmethod
    def create_indexes():
        col = WorkspaceInviteModel.get_collection()
        col.create_index('token', unique=True)
        col.create_index(
            [('workspace_id', 1), ('email', 1)],
            unique=True,
        )
        col.create_index(
            'expires_at',
            expireAfterSeconds=0,
            partialFilterExpression={'accepted_at': None},
        )

    @staticmethod
    def create(workspace_id, email: str, role: str, invited_by) -> dict:
        """Create (or replace) a pending invite for a (workspace, email) pair.

        Replaces any existing pending row for the same key to keep the unique index happy.
        """
        if role not in ('owner', 'editor', 'viewer'):
            raise ValueError(f"Invalid role: {role}")
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(invited_by, str):
            invited_by = ObjectId(invited_by)

        email_norm = (email or '').strip().lower()
        if not email_norm:
            raise ValueError("email is required")

        now = datetime.utcnow()
        token = secrets.token_urlsafe(24)
        doc = {
            'workspace_id': workspace_id,
            'email': email_norm,
            'role': role,
            'token': token,
            'invited_by': invited_by,
            'expires_at': now + timedelta(days=INVITE_TTL_DAYS),
            'accepted_at': None,
            'created_at': now,
        }

        col = WorkspaceInviteModel.get_collection()
        # Remove any existing pending invite for this (workspace, email) pair.
        col.delete_many({'workspace_id': workspace_id, 'email': email_norm})
        result = col.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_token(token: str) -> dict:
        """Look up an invite by its single-use token."""
        return WorkspaceInviteModel.get_collection().find_one({'token': token})

    @staticmethod
    def find_by_workspace(workspace_id, pending_only: bool = True) -> list:
        """List invites for a workspace.

        When pending_only=True, returns only invites that are not yet accepted and not expired.
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        query = {'workspace_id': workspace_id}
        if pending_only:
            query['accepted_at'] = None
            query['expires_at'] = {'$gt': datetime.utcnow()}
        return list(WorkspaceInviteModel.get_collection().find(query))

    @staticmethod
    def mark_accepted(token: str) -> bool:
        """Mark an invite as accepted. Returns True on success."""
        result = WorkspaceInviteModel.get_collection().update_one(
            {'token': token},
            {'$set': {'accepted_at': datetime.utcnow()}},
        )
        return result.modified_count > 0

    @staticmethod
    def revoke(token: str) -> bool:
        """Hard-delete an invite by token."""
        result = WorkspaceInviteModel.get_collection().delete_one({'token': token})
        return result.deleted_count > 0
