import re
import secrets
from datetime import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from app.extensions import mongo


class WorkspaceModel:
    """Model for Workspaces (personal or team) - top-level container for projects/resources."""

    collection_name = 'workspaces'

    @staticmethod
    def get_collection():
        return mongo.db[WorkspaceModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for workspaces."""
        collection = WorkspaceModel.get_collection()
        collection.create_index([('owner_id', 1)])
        collection.create_index([('slug', 1)], unique=True)

    @staticmethod
    def _slugify(name: str) -> str:
        """Lowercase, replace non-alnum with '-', collapse repeated dashes, strip ends."""
        s = (name or '').lower()
        s = re.sub(r'[^a-z0-9]+', '-', s)
        s = re.sub(r'-+', '-', s).strip('-')
        return s or 'workspace'

    @staticmethod
    def create(name: str, owner_id, type: str = 'team', avatar: dict = None,
               settings: dict = None) -> dict:
        """
        Create a new workspace. Slug derived from name; on collision a 6-char hex
        suffix is appended and creation retried.

        Args:
            name: Display name
            owner_id: Owner user id (str or ObjectId)
            type: 'personal' or 'team'
            avatar: dict with keys 'type' ('initials'|'url') and 'value'
            settings: opaque dict for future use

        Returns:
            Inserted document including '_id'
        """
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)

        if type not in ('personal', 'team'):
            raise ValueError(f"Invalid workspace type: {type}")

        if avatar is None:
            initials = ''.join(part[0] for part in (name or 'W').split() if part)[:2].upper() or 'W'
            avatar = {'type': 'initials', 'value': initials}

        if settings is None:
            settings = {}

        base_slug = WorkspaceModel._slugify(name)
        collection = WorkspaceModel.get_collection()
        now = datetime.utcnow()

        slug = base_slug
        for attempt in range(6):
            doc = {
                'name': name,
                'slug': slug,
                'type': type,
                'owner_id': owner_id,
                'plan': 'free',
                'avatar': avatar,
                'settings': settings,
                # Enterprise / billing fields (Phase 1).
                'domain': None,
                'sso_enforced': False,
                'scim_enabled': False,
                'plan_tier': 'free',
                'seats_total': 5,
                'credits_balance_usd': 0.0,
                'budget_mtd_usd': 0.0,
                'renews_at': None,
                'ip_allowlist': [],
                'enforce_2fa': False,
                'created_at': now,
                'updated_at': now,
            }
            try:
                result = collection.insert_one(doc)
                doc['_id'] = result.inserted_id
                return doc
            except DuplicateKeyError:
                slug = f"{base_slug}-{secrets.token_hex(3)}"

        raise RuntimeError(f"Could not generate unique slug for workspace '{name}'")

    @staticmethod
    def create_personal(owner_id, display_name: str) -> dict:
        """Convenience: create a 'personal' workspace named '<display_name>'s Space'."""
        name = f"{display_name}'s Space"
        return WorkspaceModel.create(
            name=name,
            owner_id=owner_id,
            type='personal',
        )

    @staticmethod
    def find_by_id(workspace_id) -> dict:
        """Get a workspace by id (str or ObjectId)."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        return WorkspaceModel.get_collection().find_one({'_id': workspace_id})

    @staticmethod
    def find_by_owner(owner_id) -> list:
        """List all workspaces owned by user. Personal first, then by created_at asc."""
        if isinstance(owner_id, str):
            owner_id = ObjectId(owner_id)
        cursor = WorkspaceModel.get_collection().find(
            {'owner_id': owner_id}
        ).sort([('type', 1), ('created_at', 1)])
        return list(cursor)

    @staticmethod
    def find_by_member(user_id) -> list:
        """List all workspaces user is an active member of. Sorted by (type asc, name asc)."""
        from app.models.workspace_member import WorkspaceMemberModel

        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        memberships = WorkspaceMemberModel.find_by_user(user_id, status='active')
        workspace_ids = [m['workspace_id'] for m in memberships]
        if not workspace_ids:
            return []

        cursor = WorkspaceModel.get_collection().find(
            {'_id': {'$in': workspace_ids}}
        ).sort([('type', 1), ('name', 1)])
        return list(cursor)

    @staticmethod
    def update(workspace_id, update_data: dict) -> bool:
        """
        Update whitelisted fields. Refuses to mutate owner_id, type, slug.
        Returns True if a document was modified.
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)

        allowed_fields = {
            'name', 'avatar', 'plan', 'settings',
            'domain', 'sso_enforced', 'scim_enabled',
            'plan_tier', 'seats_total', 'credits_balance_usd',
            'budget_mtd_usd', 'renews_at',
            'ip_allowlist', 'enforce_2fa',
        }
        clean = {k: v for k, v in (update_data or {}).items() if k in allowed_fields}
        if not clean:
            return False

        # Validate plan_tier.
        if 'plan_tier' in clean:
            if clean['plan_tier'] not in {'free', 'team', 'enterprise'}:
                raise ValueError(
                    "plan_tier must be one of 'free' | 'team' | 'enterprise'"
                )

        # Validate ip_allowlist.
        if 'ip_allowlist' in clean:
            value = clean['ip_allowlist']
            if not isinstance(value, list):
                raise ValueError('ip_allowlist must be a list of strings')
            cleaned_list = []
            for item in value:
                if not isinstance(item, str):
                    raise ValueError('ip_allowlist must be a list of non-empty strings')
                stripped = item.strip()
                if not stripped:
                    raise ValueError('ip_allowlist must be a list of non-empty strings')
                cleaned_list.append(stripped)
            clean['ip_allowlist'] = cleaned_list

        if 'enforce_2fa' in clean:
            clean['enforce_2fa'] = bool(clean['enforce_2fa'])

        clean['updated_at'] = datetime.utcnow()

        result = WorkspaceModel.get_collection().update_one(
            {'_id': workspace_id},
            {'$set': clean}
        )
        return result.modified_count > 0

    @staticmethod
    def delete(workspace_id) -> bool:
        """
        Hard delete the workspace document.
        Caller is responsible for orphaning members and cascading dependent resources.
        """
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        result = WorkspaceModel.get_collection().delete_one({'_id': workspace_id})
        return result.deleted_count > 0

    @staticmethod
    def find_by_slug(slug: str) -> dict:
        """Lookup by URL-safe slug (used for invite-link routes)."""
        return WorkspaceModel.get_collection().find_one({'slug': slug})
