from datetime import datetime
from bson import ObjectId
from app.extensions import mongo
from app.models.workspace_member import ROLE_HIERARCHY


class ProjectMemberModel:
    """Model for project memberships - links users to projects with a role."""

    collection_name = 'project_members'

    @staticmethod
    def get_collection():
        return mongo.db[ProjectMemberModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for project memberships."""
        collection = ProjectMemberModel.get_collection()
        collection.create_index(
            [('project_id', 1), ('user_id', 1)],
            unique=True,
        )
        collection.create_index([('user_id', 1)])

    @staticmethod
    def add(project_id, user_id, role: str, added_by) -> dict:
        """
        Insert a membership row. Idempotent: if a row already exists for
        (project_id, user_id), it is returned unchanged.

        Args:
            project_id: target project
            user_id: member user
            role: 'owner' | 'editor' | 'viewer'
            added_by: user id of the granter

        Returns:
            The membership document (existing or newly inserted).
        """
        if role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {role}")

        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if added_by is not None and isinstance(added_by, str):
            added_by = ObjectId(added_by)

        collection = ProjectMemberModel.get_collection()
        existing = collection.find_one({'project_id': project_id, 'user_id': user_id})
        if existing:
            return existing

        now = datetime.utcnow()
        doc = {
            'project_id': project_id,
            'user_id': user_id,
            'role': role,
            'added_by': added_by,
            'created_at': now,
        }
        result = collection.insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find(project_id, user_id) -> dict:
        """Return a single membership doc for (project, user) or None."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return ProjectMemberModel.get_collection().find_one({
            'project_id': project_id,
            'user_id': user_id,
        })

    @staticmethod
    def find_by_project(project_id) -> list:
        """List all members of a project."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        cursor = ProjectMemberModel.get_collection().find({
            'project_id': project_id,
        })
        return list(cursor)

    @staticmethod
    def find_by_user(user_id) -> list:
        """List memberships across projects for a given user."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        cursor = ProjectMemberModel.get_collection().find({
            'user_id': user_id,
        })
        return list(cursor)

    @staticmethod
    def update_role(project_id, user_id, role: str) -> bool:
        """Update the role of a membership. Whitelisted to 'role' only."""
        if role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {role}")
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        result = ProjectMemberModel.get_collection().update_one(
            {'project_id': project_id, 'user_id': user_id},
            {'$set': {'role': role}},
        )
        return result.modified_count > 0

    @staticmethod
    def remove(project_id, user_id) -> bool:
        """Hard-delete a membership row."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        result = ProjectMemberModel.get_collection().delete_one({
            'project_id': project_id,
            'user_id': user_id,
        })
        return result.deleted_count > 0

    @staticmethod
    def count_by_project(project_id) -> int:
        """Count members of a project."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        return ProjectMemberModel.get_collection().count_documents({
            'project_id': project_id,
        })
