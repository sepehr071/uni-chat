from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


class AuditLogModel:
    """Model for tracking administrative actions"""
    collection_name = 'audit_logs'

    @staticmethod
    def get_collection():
        return mongo.db[AuditLogModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = AuditLogModel.get_collection()
        collection.create_index('action')
        collection.create_index('admin_id')
        collection.create_index('target_id')
        collection.create_index('created_at')
        collection.create_index([('created_at', -1)])

    @staticmethod
    def create(action, admin_id, target_id=None, target_type=None, details=None, ip_address=None):
        """Create an audit log entry"""
        if isinstance(admin_id, str):
            admin_id = ObjectId(admin_id)
        if target_id and isinstance(target_id, str):
            target_id = ObjectId(target_id)

        doc = {
            'action': action,
            'admin_id': admin_id,
            'target_id': target_id,
            'target_type': target_type,
            'details': details or {},
            'ip_address': ip_address,
            'created_at': datetime.utcnow()
        }
        result = AuditLogModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_all(skip=0, limit=50, action=None, admin_id=None):
        """Get audit logs with optional filters"""
        query = {}
        if action:
            query['action'] = action
        if admin_id:
            if isinstance(admin_id, str):
                admin_id = ObjectId(admin_id)
            query['admin_id'] = admin_id

        cursor = AuditLogModel.get_collection().find(query).sort('created_at', -1).skip(skip).limit(limit)
        return list(cursor)

    @staticmethod
    def count(action=None, admin_id=None):
        """Count audit logs with optional filters"""
        query = {}
        if action:
            query['action'] = action
        if admin_id:
            if isinstance(admin_id, str):
                admin_id = ObjectId(admin_id)
            query['admin_id'] = admin_id
        return AuditLogModel.get_collection().count_documents(query)

    @staticmethod
    def get_recent(days=7, limit=100):
        """Get recent audit logs"""
        start_date = datetime.utcnow() - timedelta(days=days)
        cursor = AuditLogModel.get_collection().find({
            'created_at': {'$gte': start_date}
        }).sort('created_at', -1).limit(limit)
        return list(cursor)

    @staticmethod
    def get_actions():
        """Get list of all action types"""
        return AuditLogModel.get_collection().distinct('action')
