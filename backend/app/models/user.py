from datetime import datetime
from bson import ObjectId
import bcrypt
from app.extensions import mongo


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

    @staticmethod
    def create(email, password, display_name, role='user'):
        """Create a new user"""
        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

        user_doc = {
            'email': email.lower().strip(),
            'password_hash': password_hash,
            'role': role,
            'profile': {
                'display_name': display_name.strip(),
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
            'saved_configs': [],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = UserModel.get_collection().insert_one(user_doc)
        user_doc['_id'] = result.inserted_id
        return user_doc

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
    def add_saved_config(user_id, config_id):
        """Add a config to user's saved configs"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$addToSet': {'saved_configs': config_id}}
        )

    @staticmethod
    def remove_saved_config(user_id, config_id):
        """Remove a config from user's saved configs"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if isinstance(config_id, str):
            config_id = ObjectId(config_id)
        return UserModel.get_collection().update_one(
            {'_id': user_id},
            {'$pull': {'saved_configs': config_id}}
        )

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
