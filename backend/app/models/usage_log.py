from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


class UsageLogModel:
    """Model for tracking API usage and costs"""
    collection_name = 'usage_logs'

    @staticmethod
    def get_collection():
        return mongo.db[UsageLogModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes"""
        collection = UsageLogModel.get_collection()
        collection.create_index('user_id')
        collection.create_index('model_id')
        collection.create_index('created_at')
        collection.create_index([('user_id', 1), ('created_at', -1)])

    @staticmethod
    def create(
        user_id,
        conversation_id,
        model_id,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cached_tokens: int = 0,
        cost_usd: float = 0.0,
        feature: str = None,
        response_usage: dict = None,
        # legacy positional compat — callers that pass (message_id, tokens dict) still work
        message_id=None,
        tokens: dict = None,
    ):
        """Log a usage entry.

        Preferred call signature (new):
            UsageLogModel.create(user_id, conversation_id, model_id,
                                 prompt_tokens=N, completion_tokens=M,
                                 cached_tokens=K, cost_usd=C,
                                 feature='chat', response_usage={...})

        Legacy callers that pass (tokens=dict, cost_usd=...) still work via
        the backwards-compat shim below.
        """
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if conversation_id and isinstance(conversation_id, str):
            try:
                conversation_id = ObjectId(conversation_id)
            except Exception:
                conversation_id = None
        if message_id and isinstance(message_id, str):
            try:
                message_id = ObjectId(message_id)
            except Exception:
                message_id = None

        # Legacy shim: if caller passed the old `tokens` dict, extract fields.
        if tokens is not None:
            prompt_tokens = tokens.get('prompt', 0) or 0
            completion_tokens = tokens.get('completion', 0) or 0

        prompt_tokens = int(prompt_tokens or 0)
        completion_tokens = int(completion_tokens or 0)
        cached_tokens = int(cached_tokens or 0)

        doc = {
            'user_id': user_id,
            'conversation_id': conversation_id,
            'model_id': model_id,
            'prompt_tokens': prompt_tokens,
            'completion_tokens': completion_tokens,
            'cached_tokens': cached_tokens,
            'tokens': {
                'prompt': prompt_tokens,
                'completion': completion_tokens,
                'total': prompt_tokens + completion_tokens,
            },
            'cost_usd': float(cost_usd or 0),
            'feature': feature,
            'created_at': datetime.utcnow(),
        }
        if message_id:
            doc['message_id'] = message_id
        if response_usage:
            doc['response_usage'] = response_usage

        result = UsageLogModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def get_user_costs(user_id, days=30):
        """Get cost breakdown for a user"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        start_date = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {'$match': {
                'user_id': user_id,
                'created_at': {'$gte': start_date}
            }},
            {'$group': {
                '_id': '$model_id',
                'total_cost': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': '$tokens.total'},
                'request_count': {'$sum': 1}
            }},
            {'$sort': {'total_cost': -1}}
        ]

        results = list(UsageLogModel.get_collection().aggregate(pipeline))
        total_cost = sum(r['total_cost'] for r in results)

        return {
            'by_model': results,
            'total_cost_usd': total_cost,
            'period_days': days
        }

    @staticmethod
    def get_user_total_cost(user_id):
        """Get total cost for a user (all time)"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)

        pipeline = [
            {'$match': {'user_id': user_id}},
            {'$group': {
                '_id': None,
                'total_cost': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': '$tokens.total'}
            }}
        ]

        results = list(UsageLogModel.get_collection().aggregate(pipeline))
        if results:
            return {
                'total_cost_usd': results[0]['total_cost'],
                'total_tokens': results[0]['total_tokens']
            }
        return {'total_cost_usd': 0, 'total_tokens': 0}

    @staticmethod
    def get_daily_costs(user_id=None, days=30):
        """Get daily cost breakdown"""
        start_date = datetime.utcnow() - timedelta(days=days)

        match_stage = {'created_at': {'$gte': start_date}}
        if user_id:
            if isinstance(user_id, str):
                user_id = ObjectId(user_id)
            match_stage['user_id'] = user_id

        pipeline = [
            {'$match': match_stage},
            {'$group': {
                '_id': {
                    '$dateToString': {
                        'format': '%Y-%m-%d',
                        'date': '$created_at'
                    }
                },
                'cost': {'$sum': '$cost_usd'},
                'tokens': {'$sum': '$tokens.total'},
                'requests': {'$sum': 1}
            }},
            {'$sort': {'_id': 1}}
        ]

        return list(UsageLogModel.get_collection().aggregate(pipeline))

    @staticmethod
    def aggregate_by(group_by: str, user_id=None, from_=None, to=None):
        """Aggregate usage stats by a dimension.

        Args:
            group_by: One of 'feature', 'model', 'day', 'user'.
            user_id: Restrict to a single user (str or ObjectId). None = all users.
            from_: Optional datetime lower bound (inclusive).
            to: Optional datetime upper bound (inclusive).

        Returns:
            list[dict] with keys {key, total_cost, total_tokens, count},
            sorted descending by total_cost.
        """
        match = {}
        if user_id is not None:
            match['user_id'] = ObjectId(user_id) if isinstance(user_id, str) else user_id
        if from_ or to:
            match['created_at'] = {}
            if from_:
                match['created_at']['$gte'] = from_
            if to:
                match['created_at']['$lte'] = to

        if group_by == 'feature':
            group_id = '$feature'
        elif group_by == 'model':
            group_id = '$model_id'
        elif group_by == 'user':
            group_id = '$user_id'
        elif group_by == 'day':
            group_id = {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}
        else:
            raise ValueError(f'invalid group_by: {group_by}')

        pipeline = []
        if match:
            pipeline.append({'$match': match})
        pipeline.append({'$group': {
            '_id': group_id,
            'total_cost': {'$sum': '$cost_usd'},
            'total_tokens': {'$sum': {'$add': [
                {'$ifNull': ['$prompt_tokens', 0]},
                {'$ifNull': ['$completion_tokens', 0]},
            ]}},
            'count': {'$sum': 1},
        }})
        pipeline.append({'$sort': {'total_cost': -1}})

        docs = list(UsageLogModel.get_collection().aggregate(pipeline))
        return [
            {
                'key': str(d['_id']),
                'total_cost': d['total_cost'],
                'total_tokens': d['total_tokens'],
                'count': d['count'],
            }
            for d in docs
        ]
