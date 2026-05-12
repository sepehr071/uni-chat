from datetime import datetime, timedelta
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo


class PlatformAuditLogModel:
    """Audit log for platform-admin actions (feature toggles, etc.).

    Distinct from `audit_logs` — platform actions never bleed into the
    holding-admin (CEO) audit stream.
    """
    collection_name = 'platform_audit_logs'

    @staticmethod
    def get_collection():
        return mongo.db[PlatformAuditLogModel.collection_name]

    @staticmethod
    def create_indexes():
        collection = PlatformAuditLogModel.get_collection()
        collection.create_index([('created_at', DESCENDING)])
        collection.create_index([('platform_admin_id', ASCENDING)])
        collection.create_index([('action', ASCENDING)])

    @staticmethod
    def create(action, platform_admin_id, target_type=None, target_id=None, details=None, ip_address=None):
        """Insert a platform audit row. Returns the inserted document."""
        if isinstance(platform_admin_id, str):
            platform_admin_id = ObjectId(platform_admin_id)

        # target_id is allowed to be str (e.g. feature flag name) OR ObjectId.
        # Only coerce when it parses as a valid ObjectId AND target_type implies an entity.
        if target_id is not None and isinstance(target_id, str):
            if ObjectId.is_valid(target_id):
                target_id = ObjectId(target_id)

        doc = {
            'action': action,
            'platform_admin_id': platform_admin_id,
            'target_type': target_type,
            'target_id': target_id,
            'details': details or {},
            'ip_address': ip_address,
            'created_at': datetime.utcnow(),
        }
        result = PlatformAuditLogModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_paginated(skip=0, limit=50, action=None, days=None):
        """Return (rows, total_count) sorted by created_at desc."""
        query = {}
        if action:
            query['action'] = action
        if days:
            cutoff = datetime.utcnow() - timedelta(days=int(days))
            query['created_at'] = {'$gte': cutoff}

        col = PlatformAuditLogModel.get_collection()
        total = col.count_documents(query)
        rows = list(
            col.find(query)
            .sort('created_at', DESCENDING)
            .skip(int(skip))
            .limit(int(limit))
        )
        return rows, total
