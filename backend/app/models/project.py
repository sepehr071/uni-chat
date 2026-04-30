import re
import secrets
from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from app.extensions import mongo


class ProjectModel:
    """Model for Projects - workspace-scoped containers for folders/conversations."""

    collection_name = 'projects'

    @staticmethod
    def get_collection():
        return mongo.db[ProjectModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for projects."""
        collection = ProjectModel.get_collection()
        collection.create_index([('workspace_id', 1), ('archived', 1)])
        collection.create_index(
            [('workspace_id', 1), ('slug', 1)],
            unique=True,
        )

    @staticmethod
    def _slugify(name: str) -> str:
        """Lowercase, replace non-alnum with '-', collapse repeated dashes, strip ends."""
        s = (name or '').lower()
        s = re.sub(r'[^a-z0-9]+', '-', s)
        s = re.sub(r'-+', '-', s).strip('-')
        return s or 'project'

    @staticmethod
    def create(workspace_id, name: str, created_by, color: str = '#5c9aed',
               icon: str = None, description: str = None) -> dict:
        """
        Create a new project. Slug derived from name; on collision a 6-char hex
        suffix is appended and creation retried.

        Args:
            workspace_id: Parent workspace id (str or ObjectId)
            name: Display name
            created_by: User id of creator (str or ObjectId)
            color: Hex color string (default '#5c9aed')
            icon: Optional icon identifier
            description: Optional description string

        Returns:
            Inserted document including '_id'
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if isinstance(created_by, str):
            created_by = ObjectId(created_by)

        base_slug = ProjectModel._slugify(name)
        collection = ProjectModel.get_collection()
        now = datetime.utcnow()

        slug = base_slug
        for attempt in range(6):
            doc = {
                'workspace_id': workspace_id,
                'name': name,
                'slug': slug,
                'color': color,
                'icon': icon,
                'description': description,
                'archived': False,
                'created_by': created_by,
                'created_at': now,
                'updated_at': now,
            }
            try:
                result = collection.insert_one(doc)
                doc['_id'] = result.inserted_id
                return doc
            except DuplicateKeyError:
                slug = f"{base_slug}-{secrets.token_hex(3)}"

        raise RuntimeError(f"Could not generate unique slug for project '{name}'")

    @staticmethod
    def find_by_id(project_id) -> dict:
        """Get a project by id (str or ObjectId)."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        return ProjectModel.get_collection().find_one({'_id': project_id})

    @staticmethod
    def find_by_workspace(workspace_id, archived: bool = False) -> list:
        """List projects in a workspace filtered by archived state.

        Sorts so active projects come first, then alphabetically by name.
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        cursor = ProjectModel.get_collection().find({
            'workspace_id': workspace_id,
            'archived': archived,
        }).sort([('archived', 1), ('name', 1)])
        return list(cursor)

    @staticmethod
    def update(project_id, update_data: dict) -> bool:
        """
        Update whitelisted fields. Refuses to mutate workspace_id, slug, created_by.
        Returns True if a document was modified.
        """
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)

        allowed_fields = {'name', 'color', 'icon', 'description', 'archived'}
        clean = {k: v for k, v in (update_data or {}).items() if k in allowed_fields}
        if not clean:
            return False

        clean['updated_at'] = datetime.utcnow()

        result = ProjectModel.get_collection().update_one(
            {'_id': project_id},
            {'$set': clean}
        )
        return result.modified_count > 0

    @staticmethod
    def archive(project_id) -> bool:
        """Soft-delete: mark project archived."""
        return ProjectModel.update(project_id, {'archived': True})

    @staticmethod
    def unarchive(project_id) -> bool:
        """Restore an archived project."""
        return ProjectModel.update(project_id, {'archived': False})

    @staticmethod
    def delete(project_id) -> bool:
        """
        Hard delete the project document.
        Caller is responsible for cascading members and reassigning folders/chats.
        """
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        result = ProjectModel.get_collection().delete_one({'_id': project_id})
        return result.deleted_count > 0

    @staticmethod
    def count_by_workspace(workspace_id, archived: bool = False) -> int:
        """Count projects in a workspace filtered by archived state."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        return ProjectModel.get_collection().count_documents({
            'workspace_id': workspace_id,
            'archived': archived,
        })
