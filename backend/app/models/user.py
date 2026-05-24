from datetime import datetime
from bson import ObjectId
import bcrypt
from app.extensions import mongo

VALID_USER_ROLES = {'user', 'manager', 'admin'}


class UserModel:
    collection_name = 'users'

    @staticmethod
    def get_collection():
        return mongo.db[UserModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for the users collection"""
        collection = UserModel.get_collection()
        collection.create_index('email', unique=True)
        collection.create_index('role')
        collection.create_index('status.is_banned')
        collection.create_index('created_at')
        collection.create_index('telegram_id', unique=True, sparse=True)
        collection.create_index('keycloak_sub', unique=True, sparse=True)

    @staticmethod
    def set_role(user_id, role: str) -> bool:
        """Set a user's global role. Validates against VALID_USER_ROLES."""
        if role not in VALID_USER_ROLES:
            raise ValueError(f"Invalid role: {role!r}. Must be one of {VALID_USER_ROLES}")
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        result = UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {'role': role, 'updated_at': datetime.utcnow()}},
        )
        return result.modified_count > 0

    @staticmethod
    def create(email, password=None, display_name='', role='user', keycloak_sub=None):
        """Create a new user.

        Also auto-spawns the user's personal workspace and adds an owner
        membership row. The personal workspace's _id is set as
        active_workspace_id so the API has a non-null tenant for every user.

        `password` is optional — SSO-only users (Keycloak) have no local password
        and `verify_password` will reject them (intentional). `keycloak_sub`, when
        provided, is stored on the user doc and looked up by the JWT user-lookup
        callback for RS256 tokens.
        """
        if role not in VALID_USER_ROLES:
            raise ValueError(f"Invalid role: {role!r}. Must be one of {VALID_USER_ROLES}")
        # Hash password (skip for SSO-only users).
        password_hash = (
            bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
            if password is not None
            else None
        )

        normalized_email = email.lower().strip() if email else ''
        resolved_display_name = (display_name or '').strip()
        if not resolved_display_name:
            resolved_display_name = (
                normalized_email.split('@')[0] if normalized_email else ''
            )

        user_doc = {
            'email': normalized_email,
            'password_hash': password_hash,
            'role': role,
            'profile': {
                'display_name': resolved_display_name,
                'avatar_url': None,
                'bio': ''
            },
            'settings': {
                'default_config_id': None,
                'theme': 'dark',
                'notifications_enabled': True
            },
            'usage': {
                'messages_sent': 0,
                'tokens_used': 0,
                'tokens_limit': -1,  # -1 = unlimited
                'last_active': datetime.utcnow()
            },
            'status': {
                'is_banned': False,
                'ban_reason': None,
                'banned_at': None,
                'banned_by': None
            },
            'active_workspace_id': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        if keycloak_sub:
            user_doc['keycloak_sub'] = keycloak_sub

        result = UserModel.get_collection().insert_one(user_doc)
        user_doc['_id'] = result.inserted_id

        # Auto-create personal workspace + owner membership.
        # Imports are inline to avoid circular imports at module load time.
        try:
            from app.models.workspace import WorkspaceModel
            from app.models.workspace_member import WorkspaceMemberModel

            ws_display_name = resolved_display_name or (
                normalized_email.split('@')[0] if normalized_email else 'User'
            )
            ws = WorkspaceModel.create_personal(user_doc['_id'], ws_display_name)
            WorkspaceMemberModel.add(
                ws['_id'],
                user_doc['_id'],
                'owner',
                invited_by=user_doc['_id'],
                status='active',
            )
            UserModel.get_collection().update_one(
                {'_id': user_doc['_id']},
                {'$set': {'active_workspace_id': ws['_id']}}
            )
            user_doc['active_workspace_id'] = ws['_id']
        except Exception:
            # Don't break user creation if workspace bootstrap fails — the
            # migration script can backfill. Re-raise in dev for visibility.
            import logging
            logging.getLogger(__name__).exception(
                'Failed to bootstrap personal workspace for user %s',
                user_doc.get('_id'),
            )

        return user_doc

    @staticmethod
    def set_active_workspace(user_id, workspace_id):
        """Set the user's active workspace context."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {
                'active_workspace_id': workspace_id,
                'updated_at': datetime.utcnow(),
            }}
        )

    @staticmethod
    def find_by_email(email):
        """Find user by email"""
        return UserModel.get_collection().find_one({'email': email.lower().strip()})

    @staticmethod
    def find_by_id(user_id):
        """Find user by ID"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().find_one({'_id': user_id})

    @staticmethod
    def verify_password(user, password):
        """Verify user password"""
        if not user or not user.get('password_hash'):
            return False
        return bcrypt.checkpw(password.encode('utf-8'), user['password_hash'])

    @staticmethod
    def update(user_id, update_data):
        """Update user document"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        update_data['updated_at'] = datetime.utcnow()
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': update_data}
        )

    @staticmethod
    def update_last_active(user_id):
        """Update user's last active timestamp"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {'usage.last_active': datetime.utcnow()}}
        )

    @staticmethod
    def find_by_telegram_id(telegram_id):
        """Find user by Telegram ID (None if no user has it)"""
        return UserModel.get_collection().find_one({'telegram_id': int(telegram_id)})

    @staticmethod
    def find_by_keycloak_sub(sub):
        """Find user by Keycloak subject UUID (None if not linked)."""
        return UserModel.get_collection().find_one({'keycloak_sub': sub})

    @staticmethod
    def upsert_from_keycloak(sub, email, display_name, role):
        """Upsert a user from a Keycloak userinfo payload.

        Lookup order: by `keycloak_sub`, then by `email`. If neither matches,
        a new user is created (no password, KC `sub` recorded).

        Role from the KC mapping always wins on re-login — calls
        `update_one({'$set': {'role': role}})` directly, bypassing
        `set_role`'s validator since the caller is responsible for passing a
        value in `VALID_USER_ROLES`.

        Returns the user document (post-update).
        """
        col = UserModel.get_collection()
        normalized_email = email.lower().strip() if email else ''
        existing = col.find_one({'keycloak_sub': sub})
        if existing:
            updates = {'updated_at': datetime.utcnow()}
            if normalized_email and existing.get('email') != normalized_email:
                updates['email'] = normalized_email
            if existing.get('role') != role:
                updates['role'] = role
            if display_name and existing.get('profile', {}).get('display_name') != display_name:
                updates['profile.display_name'] = display_name
            col.update_one({'_id': existing['_id']}, {'$set': updates})
            return col.find_one({'_id': existing['_id']})

        if normalized_email:
            by_email = col.find_one({'email': normalized_email})
            if by_email:
                col.update_one(
                    {'_id': by_email['_id']},
                    {'$set': {
                        'keycloak_sub': sub,
                        'role': role,
                        'updated_at': datetime.utcnow(),
                    }},
                )
                return col.find_one({'_id': by_email['_id']})

        return UserModel.create(
            email=normalized_email,
            password=None,
            display_name=display_name or (normalized_email.split('@')[0] if normalized_email else 'SSO User'),
            role=role,
            keycloak_sub=sub,
        )

    @staticmethod
    def set_telegram_link(user_id, telegram_id, telegram_username=None):
        """Bind a Telegram account to this user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {
                'telegram_id': int(telegram_id),
                'telegram_username': telegram_username,
                'telegram_linked_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
            }}
        )

    @staticmethod
    def clear_telegram_link(user_id):
        """Unbind Telegram from this user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$unset': {
                'telegram_id': '',
                'telegram_username': '',
                'telegram_linked_at': '',
                'telegram_active_conversation_id': '',
                'telegram_active_config_id': '',
                'telegram_active_project_id': '',
                'telegram_rate_limit': '',
            },
             '$set': {'updated_at': datetime.utcnow()}}
        )

    @staticmethod
    def increment_usage(user_id, messages=0, tokens=0):
        """Increment user usage statistics"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {
                '$inc': {
                    'usage.messages_sent': messages,
                    'usage.tokens_used': tokens
                },
                '$set': {'usage.last_active': datetime.utcnow()}
            }
        )

    @staticmethod
    def ban_user(user_id, reason, admin_id):
        """Ban a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if isinstance(admin_id, str):
            admin_id = ObjectId(admin_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {
                '$set': {
                    'status.is_banned': True,
                    'status.ban_reason': reason,
                    'status.banned_at': datetime.utcnow(),
                    'status.banned_by': admin_id,
                    'updated_at': datetime.utcnow()
                }
            }
        )

    @staticmethod
    def unban_user(user_id):
        """Unban a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {
                '$set': {
                    'status.is_banned': False,
                    'status.ban_reason': None,
                    'status.banned_at': None,
                    'status.banned_by': None,
                    'updated_at': datetime.utcnow()
                }
            }
        )

    @staticmethod
    def get_all(skip=0, limit=20, include_banned=True):
        """Get all users with pagination"""
        query = {}
        if not include_banned:
            query['status.is_banned'] = False

        cursor = UserModel.get_collection().find(
            query,
            {'password_hash': 0}  # Exclude password hash
        ).sort('created_at', -1).skip(skip).limit(limit)

        return list(cursor)

    @staticmethod
    def count(include_banned=True):
        """Count total users"""
        query = {}
        if not include_banned:
            query['status.is_banned'] = False
        return UserModel.get_collection().count_documents(query)

    @staticmethod
    def ensure_default_admin(email, password, display_name='Admin'):
        """Create default admin user if it doesn't exist"""
        existing = UserModel.find_by_email(email)
        if existing:
            # Ensure the user has admin role
            if existing.get('role') != 'admin':
                UserModel.update(existing['_id'], {'role': 'admin'})
                print(f"[Admin] Updated {email} to admin role")
            return existing

        # Create new admin user
        admin = UserModel.create(
            email=email,
            password=password,
            display_name=display_name,
            role='admin'
        )
        print(f"[Admin] Created default admin: {email}")
        return admin

    @staticmethod
    def get_default_ai_preferences():
        """Return default AI preferences structure"""
        return {
            'enabled': True,
            'user_info': {
                'name': '',
                'language': 'English',
                'expertise_level': 'intermediate'  # beginner|intermediate|expert
            },
            'behavior': {
                'tone': 'professional',  # professional|friendly|casual
                'response_style': 'balanced'  # concise|detailed|balanced
            },
            'custom_instructions': '',  # max 2000 chars
            'updated_at': None
        }

    @staticmethod
    def get_ai_preferences(user_id):
        """Get AI preferences for a user, returns defaults if not set"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        user = UserModel.get_collection().find_one(
            {'_id': user_id},
            {'ai_preferences': 1}
        )
        if not user:
            return UserModel.get_default_ai_preferences()
        return user.get('ai_preferences') or UserModel.get_default_ai_preferences()

    @staticmethod
    def update_timezone(user_id: str, tz_str: str) -> None:
        """Set the user's IANA timezone. Raises ValueError if tz_str is invalid."""
        import zoneinfo
        zoneinfo.ZoneInfo(tz_str)  # raises ZoneInfoNotFoundError (subclass of KeyError) if bad
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {'timezone': tz_str, 'updated_at': datetime.utcnow()}},
        )

    @staticmethod
    def get_timezone(user_id: str) -> str:
        """Return the user's timezone string, defaulting to 'UTC'."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        user = UserModel.get_collection().find_one({'_id': user_id}, {'timezone': 1})
        if not user:
            return 'UTC'
        return user.get('timezone') or 'UTC'

    @staticmethod
    def update_ai_preferences(user_id, preferences):
        """
        Update AI preferences for a user.
        Merges provided preferences with existing ones.
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        # Get current preferences or defaults
        current = UserModel.get_ai_preferences(user_id)

        # Merge user_info
        if 'user_info' in preferences:
            current['user_info'] = {
                **current.get('user_info', {}),
                **preferences['user_info']
            }

        # Merge behavior
        if 'behavior' in preferences:
            current['behavior'] = {
                **current.get('behavior', {}),
                **preferences['behavior']
            }

        # Update top-level fields
        if 'enabled' in preferences:
            current['enabled'] = preferences['enabled']
        if 'custom_instructions' in preferences:
            # Limit custom instructions to 2000 characters
            current['custom_instructions'] = preferences['custom_instructions'][:2000]

        current['updated_at'] = datetime.utcnow()

        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$set': {'ai_preferences': current, 'updated_at': datetime.utcnow()}}
        )
