from datetime import datetime
from bson import ObjectId
from pymongo import ASCENDING
import bcrypt

from app.extensions import mongo


class PlatformAdminModel:
    collection_name = 'platform_admins'

    @staticmethod
    def get_collection():
        return mongo.db[PlatformAdminModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for the platform_admins collection"""
        collection = PlatformAdminModel.get_collection()
        collection.create_index([('email', ASCENDING)], unique=True)

    # P2.34 — match the policy enforced by migrate_platform_admin.py:
    # min 12 chars, reject the obvious throwaways. Validation happens at the
    # model layer so every entry point (migration, CLI bootstrap, route) gets
    # the same guarantee — there's no "create a platform admin via API" route
    # today, but anyone adding one later won't accidentally skip the check.
    _MIN_PASSWORD_LEN = 12
    _WEAK_PASSWORDS = frozenset({
        'admin', 'admin123', 'changeme', 'password', 'password123',
        '123456', '12345678', 'qwerty', 'letmein', 'welcome',
        'platformadmin', 'operator', 'opsadmin',
    })

    @staticmethod
    def _validate_password(password: str) -> None:
        """Raise ValueError if the password doesn't meet the policy."""
        if not isinstance(password, str) or len(password) < PlatformAdminModel._MIN_PASSWORD_LEN:
            raise ValueError(
                f'platform_admin password must be at least {PlatformAdminModel._MIN_PASSWORD_LEN} characters'
            )
        if password.lower() in PlatformAdminModel._WEAK_PASSWORDS:
            raise ValueError('platform_admin password rejected: well-known weak value')

    @staticmethod
    def create(email, password, display_name):
        """Create a new platform admin row. Hashes password with bcrypt-bytes."""
        PlatformAdminModel._validate_password(password)
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        now = datetime.utcnow()
        doc = {
            'email': email.lower().strip(),
            'password_hash': password_hash,
            'display_name': (display_name or '').strip() or 'Platform Operator',
            'created_at': now,
            'updated_at': now,
            'last_active_at': None,
        }
        result = PlatformAdminModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_email(email):
        """Find platform admin by email (case-insensitive via lowercase index)."""
        if not email:
            return None
        return PlatformAdminModel.get_collection().find_one({'email': email.lower().strip()})

    @staticmethod
    def find_by_id(pa_id):
        """Find platform admin by ID (accepts str or ObjectId)."""
        if isinstance(pa_id, str):
            pa_id = ObjectId(pa_id)
        return PlatformAdminModel.get_collection().find_one({'_id': pa_id})

    @staticmethod
    def verify_password(pa, password):
        """Verify platform admin password using bcrypt-bytes."""
        if not pa or not pa.get('password_hash'):
            return False
        return bcrypt.checkpw(password.encode('utf-8'), pa['password_hash'])

    @staticmethod
    def update_last_active(pa_id):
        """Stamp last_active_at on a platform admin row."""
        if isinstance(pa_id, str):
            pa_id = ObjectId(pa_id)
        return PlatformAdminModel.get_collection().update_one(
            {'_id': pa_id},
            {'$set': {'last_active_at': datetime.utcnow()}}
        )

    @staticmethod
    def ensure_default(email, password, display_name='Platform Operator'):
        """Create-only bootstrap for the configured platform admin.

        If a row already exists with that email, refresh non-secret fields
        (display_name + updated_at) but NEVER rotate the password hash.
        Matches UserModel.ensure_default_admin semantics.
        """
        existing = PlatformAdminModel.find_by_email(email)
        if existing:
            updates: dict = {'updated_at': datetime.utcnow()}
            if display_name and existing.get('display_name') != display_name.strip():
                updates['display_name'] = display_name.strip()
            PlatformAdminModel.get_collection().update_one(
                {'_id': existing['_id']},
                {'$set': updates}
            )
            print(f"[PlatformAdmin] Already exists: {email}")
            return existing

        pa = PlatformAdminModel.create(email=email, password=password, display_name=display_name)
        print(f"[PlatformAdmin] Created default platform admin: {email}")
        return pa
