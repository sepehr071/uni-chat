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
    def create(user_id, conversation_id, message_id, model_id, tokens, cost_usd):
        """Log a usage entry"""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        if isinstance(conversation_id, str):
            conversation_id = ObjectId(conversation_id)
        if isinstance(message_id, str):
            message_id = ObjectId(message_id)

        doc = {
            'user_id': user_id,
            'conversation_id': conversation_id,
            'message_id': message_id,
            'model_id': model_id,
            'tokens': {
                'prompt': tokens.get('prompt', 0),
                'completion': tokens.get('completion', 0),
                'total': tokens.get('prompt', 0) + tokens.get('completion', 0)
            },
            'cost_usd': cost_usd,
            'created_at': datetime.utcnow()
        }
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
