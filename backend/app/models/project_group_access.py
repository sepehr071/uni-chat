"""ProjectGroupAccess — grants a group a role on a specific project."""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class ProjectGroupAccessModel:
    """Grant rows mapping (project, group) -> role with optional expiry."""

    collection_name = 'project_group_access'

    @staticmethod
    def get_collection():
        return mongo.db[ProjectGroupAccessModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for project group access."""
        collection = ProjectGroupAccessModel.get_collection()
        collection.create_index([('project_id', 1), ('group_id', 1)], unique=True)

    @staticmethod
    def set(project_id, group_id, role: str, expires_at=None, created_by=None) -> dict:
        """Upsert an access row. ``role`` is validated by the caller (route layer)."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        if created_by is not None and isinstance(created_by, str):
            created_by = ObjectId(created_by)

        now = datetime.utcnow()
        update = {
            '$set': {
                'role': role,
                'expires_at': expires_at,
                'updated_at': now,
            },
            '$setOnInsert': {
                'project_id': project_id,
                'group_id': group_id,
                'created_by': created_by,
                'created_at': now,
            },
        }
        ProjectGroupAccessModel.get_collection().update_one(
            {'project_id': project_id, 'group_id': group_id},
            update,
            upsert=True,
        )
        return ProjectGroupAccessModel.get_collection().find_one({
            'project_id': project_id,
            'group_id': group_id,
        })

    @staticmethod
    def remove(project_id, group_id) -> bool:
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(group_id, str):
            group_id = ObjectId(group_id)
        result = ProjectGroupAccessModel.get_collection().delete_one({
            'project_id': project_id,
            'group_id': group_id,
        })
        return result.deleted_count > 0

    @staticmethod
    def find_by_project(project_id) -> list:
        """List all group-access rows for a given project."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        cursor = ProjectGroupAccessModel.get_collection().find({
            'project_id': project_id,
        })
        return list(cursor)

    @staticmethod
    def find_groups_with_access(project_id, user_id) -> list:
        """Groups this user belongs to that have an active access grant on this project.

        Returns a list of dicts: ``{group, role, expires_at}``.
        Honors ``expires_at`` — expired rows are filtered out.
        """
        from app.models.group_member import GroupMemberModel
        from app.models.group import GroupModel

        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # All groups the user belongs to.
        membership_rows = list(
            GroupMemberModel.get_collection().find({'user_id': user_id})
        )
        if not membership_rows:
            return []
        user_group_ids = {r['group_id'] for r in membership_rows}

        access_rows = ProjectGroupAccessModel.find_by_project(project_id)
        now = datetime.utcnow()
        out = []
        for row in access_rows:
            if row['group_id'] not in user_group_ids:
                continue
            expires_at = row.get('expires_at')
            if expires_at and isinstance(expires_at, datetime) and expires_at <= now:
                continue
            group = GroupModel.find_by_id(row['group_id'])
            if not group:
                continue
            out.append({
                'group': group,
                'role': row.get('role'),
                'expires_at': expires_at,
            })
        return out
