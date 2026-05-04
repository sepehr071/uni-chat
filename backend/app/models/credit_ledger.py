"""Manual credit ledger — append-only entries that fund workspace spend."""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


_ALLOWED_TYPES = {'top_up', 'adjustment', 'refund'}


class CreditLedgerModel:
    """Append-only ledger of credit movements for a workspace."""

    collection_name = 'credit_ledger'

    @staticmethod
    def get_collection():
        return mongo.db[CreditLedgerModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for the credit ledger."""
        collection = CreditLedgerModel.get_collection()
        collection.create_index([('workspace_id', 1), ('created_at', -1)])

    @staticmethod
    def add_entry(workspace_id, amount_usd: float, type: str, note: str,
                  added_by, user_id=None) -> dict:
        """Append a single ledger entry.

        ``type`` must be one of ``top_up | adjustment | refund``.
        ``amount_usd`` is signed — top-ups are positive, refunds are typically positive,
        adjustments may be negative.
        """
        if type not in _ALLOWED_TYPES:
            raise ValueError(f"Invalid ledger type: {type}")

        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        if added_by is not None and isinstance(added_by, str):
            added_by = ObjectId(added_by)
        if user_id is not None and isinstance(user_id, str):
            user_id = ObjectId(user_id)

        doc = {
            'workspace_id': workspace_id,
            'user_id': user_id,
            'amount_usd': float(amount_usd or 0),
            'type': type,
            'note': note or '',
            'added_by': added_by,
            'created_at': datetime.utcnow(),
        }
        result = CreditLedgerModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_workspace(workspace_id, limit: int = 100, skip: int = 0) -> list:
        """Newest entries first."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        cursor = CreditLedgerModel.get_collection().find({
            'workspace_id': workspace_id,
        }).sort('created_at', -1).skip(skip).limit(limit)
        return list(cursor)

    @staticmethod
    def sum_credits(workspace_id) -> float:
        """Return signed sum of ``amount_usd`` for all entries."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        pipeline = [
            {'$match': {'workspace_id': workspace_id}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount_usd'}}},
        ]
        rows = list(CreditLedgerModel.get_collection().aggregate(pipeline))
        if not rows:
            return 0.0
        return float(rows[0].get('total') or 0)
