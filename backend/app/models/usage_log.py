"""Usage logs — captures full OpenRouter cost data per request.

Schema is additive — old field names (``model_id``, ``feature``, ``tokens.*``)
are preserved alongside the new schema (``model``, ``provider``,
``workspace_id``, ``project_id``, ``cached_tokens``, ``cost_usd``, etc.) so
existing aggregation queries continue to work.
"""

from datetime import datetime, timedelta
from bson import ObjectId
from app.extensions import mongo


class UsageLogModel:
    """Model for tracking API usage and costs."""
    collection_name = 'usage_logs'

    @staticmethod
    def get_collection():
        return mongo.db[UsageLogModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for usage logs."""
        collection = UsageLogModel.get_collection()
        # Legacy / general indexes (kept for back-compat).
        collection.create_index('user_id')
        collection.create_index('model_id')
        collection.create_index('created_at')
        collection.create_index([('user_id', 1), ('created_at', -1)])
        # New analytics indexes.
        collection.create_index([('workspace_id', 1), ('created_at', -1)])
        collection.create_index([('project_id', 1), ('created_at', -1)])
        collection.create_index([('model', 1), ('created_at', -1)])
        # Sparse + unique on generation_id (some legacy rows have no id).
        try:
            collection.create_index(
                'generation_id',
                unique=True,
                sparse=True,
                name='uniq_generation_id',
            )
        except Exception:
            # Already exists or duplicate legacy data — keep going.
            pass

    @staticmethod
    def create(
        user_id=None,
        conversation_id=None,
        model_id=None,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cached_tokens: int = 0,
        cost_usd: float = 0.0,
        feature: str = None,
        response_usage: dict = None,
        # legacy positional compat — callers that pass (message_id, tokens dict) still work
        message_id=None,
        tokens: dict = None,
        # Phase 1 enterprise fields.
        generation_id: str = None,
        workspace_id=None,
        project_id=None,
        model: str = None,
        provider: str = None,
        cache_write_tokens: int = 0,
        reasoning_tokens: int = 0,
        upstream_cost_usd: float = None,
        is_streaming: bool = False,
        finish_reason: str = None,
        origin: str = 'web',
        data: dict = None,
    ):
        """Log a usage entry.

        Preferred new call signature::

            UsageLogModel.create(
                generation_id='gen-abc',
                user_id=str(uid),
                workspace_id=str(wid),
                project_id=str(pid) or None,
                model='openai/gpt-5.2',
                provider='OpenAI',
                prompt_tokens=N,
                completion_tokens=M,
                cached_tokens=K,
                cost_usd=C,
                origin='web',
                is_streaming=False,
                finish_reason='stop',
                conversation_id=str(cid),
            )

        Legacy callers (`tokens=dict`, `cost_usd=...`, `model_id=...`,
        `feature=...`) still work — those fields are filled in alongside the
        new schema.
        """
        # Allow callers to pass a single ``data`` dict instead of kwargs (matches
        # the convention requested in the migration plan).
        if data is not None and isinstance(data, dict):
            generation_id = data.get('generation_id', generation_id)
            user_id = data.get('user_id', user_id)
            workspace_id = data.get('workspace_id', workspace_id)
            project_id = data.get('project_id', project_id)
            model = data.get('model', model)
            provider = data.get('provider', provider)
            prompt_tokens = data.get('prompt_tokens', prompt_tokens)
            completion_tokens = data.get('completion_tokens', completion_tokens)
            cached_tokens = data.get('cached_tokens', cached_tokens)
            cache_write_tokens = data.get('cache_write_tokens', cache_write_tokens)
            reasoning_tokens = data.get('reasoning_tokens', reasoning_tokens)
            cost_usd = data.get('cost_usd', cost_usd)
            upstream_cost_usd = data.get('upstream_cost_usd', upstream_cost_usd)
            is_streaming = data.get('is_streaming', is_streaming)
            finish_reason = data.get('finish_reason', finish_reason)
            conversation_id = data.get('conversation_id', conversation_id)
            origin = data.get('origin', origin)

        if isinstance(user_id, str):
            try:
                user_id = ObjectId(user_id)
            except Exception:
                pass
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
        if workspace_id and isinstance(workspace_id, str):
            try:
                workspace_id = ObjectId(workspace_id)
            except Exception:
                workspace_id = None
        if project_id and isinstance(project_id, str):
            try:
                project_id = ObjectId(project_id)
            except Exception:
                project_id = None

        # Legacy shim: if caller passed the old `tokens` dict, extract fields.
        if tokens is not None:
            prompt_tokens = tokens.get('prompt', 0) or 0
            completion_tokens = tokens.get('completion', 0) or 0

        prompt_tokens = int(prompt_tokens or 0)
        completion_tokens = int(completion_tokens or 0)
        cached_tokens = int(cached_tokens or 0)
        cache_write_tokens = int(cache_write_tokens or 0)
        reasoning_tokens = int(reasoning_tokens or 0)

        # Resolve model: prefer explicit ``model`` kwarg, fall back to model_id.
        resolved_model = model or model_id
        # Provider: derive from "<provider>/<rest>" if not explicitly given.
        if not provider and resolved_model and '/' in resolved_model:
            provider = resolved_model.split('/', 1)[0]

        doc = {
            # Legacy fields (kept for back-compat).
            'user_id': user_id,
            'conversation_id': conversation_id,
            'model_id': resolved_model,
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
            # New enterprise fields.
            'generation_id': generation_id,
            'workspace_id': workspace_id,
            'project_id': project_id,
            'model': resolved_model,
            'provider': provider,
            'cache_write_tokens': cache_write_tokens,
            'reasoning_tokens': reasoning_tokens,
            'total_tokens': prompt_tokens + completion_tokens,
            'upstream_cost_usd': float(upstream_cost_usd) if upstream_cost_usd is not None else None,
            'is_streaming': bool(is_streaming),
            'finish_reason': finish_reason,
            'origin': origin or 'web',
        }
        if message_id:
            doc['message_id'] = message_id
        if response_usage:
            doc['response_usage'] = response_usage

        result = UsageLogModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    # ------------------------------------------------------------------
    # Legacy aggregations (kept; admin dashboard relies on these).
    # ------------------------------------------------------------------

    @staticmethod
    def get_user_costs(user_id, days=30):
        """Get cost breakdown for a user."""
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
        """Get total cost for a user (all time)."""
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
        """Get daily cost breakdown."""
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

    # ------------------------------------------------------------------
    # Phase 1 — workspace-scoped aggregations.
    # ------------------------------------------------------------------

    @staticmethod
    def _ws_match(workspace_id, start=None, end=None) -> dict:
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        match = {'workspace_id': workspace_id}
        if start or end:
            match['created_at'] = {}
            if start:
                match['created_at']['$gte'] = start
            if end:
                match['created_at']['$lte'] = end
        return match

    @staticmethod
    def aggregate_workspace_spend(workspace_id, start=None, end=None) -> float:
        """Sum cost_usd across all rows for a workspace within optional window."""
        match = UsageLogModel._ws_match(workspace_id, start, end)
        pipeline = [
            {'$match': match},
            {'$group': {'_id': None, 'total': {'$sum': '$cost_usd'}}},
        ]
        rows = list(UsageLogModel.get_collection().aggregate(pipeline))
        return float(rows[0]['total']) if rows else 0.0

    @staticmethod
    def aggregate_user_spend(workspace_id, start=None, end=None) -> list:
        """Group by user_id within a workspace; sum cost_usd, total_tokens, count."""
        match = UsageLogModel._ws_match(workspace_id, start, end)
        pipeline = [
            {'$match': match},
            {'$group': {
                '_id': '$user_id',
                'total_cost': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': {'$add': [
                    {'$ifNull': ['$prompt_tokens', 0]},
                    {'$ifNull': ['$completion_tokens', 0]},
                ]}},
                'count': {'$sum': 1},
            }},
            {'$sort': {'total_cost': -1}},
        ]
        rows = list(UsageLogModel.get_collection().aggregate(pipeline))
        return [
            {
                'user_id': str(r['_id']) if r['_id'] else None,
                'total_cost': r['total_cost'],
                'total_tokens': r['total_tokens'],
                'count': r['count'],
            }
            for r in rows
        ]

    @staticmethod
    def aggregate_project_spend(workspace_id, start=None, end=None) -> list:
        """Group by project_id within a workspace."""
        match = UsageLogModel._ws_match(workspace_id, start, end)
        pipeline = [
            {'$match': match},
            {'$group': {
                '_id': '$project_id',
                'total_cost': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': {'$add': [
                    {'$ifNull': ['$prompt_tokens', 0]},
                    {'$ifNull': ['$completion_tokens', 0]},
                ]}},
                'count': {'$sum': 1},
            }},
            {'$sort': {'total_cost': -1}},
        ]
        rows = list(UsageLogModel.get_collection().aggregate(pipeline))
        return [
            {
                'project_id': str(r['_id']) if r['_id'] else None,
                'total_cost': r['total_cost'],
                'total_tokens': r['total_tokens'],
                'count': r['count'],
            }
            for r in rows
        ]

    @staticmethod
    def aggregate_model_spend(workspace_id, start=None, end=None) -> list:
        """Group by model id within a workspace."""
        match = UsageLogModel._ws_match(workspace_id, start, end)
        pipeline = [
            {'$match': match},
            {'$group': {
                '_id': {'$ifNull': ['$model', '$model_id']},
                'total_cost': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': {'$add': [
                    {'$ifNull': ['$prompt_tokens', 0]},
                    {'$ifNull': ['$completion_tokens', 0]},
                ]}},
                'count': {'$sum': 1},
            }},
            {'$sort': {'total_cost': -1}},
        ]
        rows = list(UsageLogModel.get_collection().aggregate(pipeline))
        return [
            {
                'model': r['_id'],
                'total_cost': r['total_cost'],
                'total_tokens': r['total_tokens'],
                'count': r['count'],
            }
            for r in rows
        ]

    @staticmethod
    def aggregate_daily(workspace_id, days: int = 30) -> list:
        """Daily buckets (chronological). Returns one row per UTC day."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        start = datetime.utcnow() - timedelta(days=days)
        pipeline = [
            {'$match': {
                'workspace_id': workspace_id,
                'created_at': {'$gte': start},
            }},
            {'$group': {
                '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}},
                'cost_usd': {'$sum': '$cost_usd'},
                'total_tokens': {'$sum': {'$add': [
                    {'$ifNull': ['$prompt_tokens', 0]},
                    {'$ifNull': ['$completion_tokens', 0]},
                ]}},
                'messages': {'$sum': 1},
            }},
            {'$sort': {'_id': 1}},
        ]
        rows = list(UsageLogModel.get_collection().aggregate(pipeline))
        return [
            {
                'date': r['_id'],
                'cost_usd': r['cost_usd'],
                'total_tokens': r['total_tokens'],
                'messages': r['messages'],
            }
            for r in rows
        ]

    @staticmethod
    def total_messages_this_month(workspace_id) -> int:
        """Total request count this calendar month (UTC)."""
        if isinstance(workspace_id, str):
            workspace_id = ObjectId(workspace_id)
        now = datetime.utcnow()
        start = datetime(now.year, now.month, 1)
        return UsageLogModel.get_collection().count_documents({
            'workspace_id': workspace_id,
            'created_at': {'$gte': start},
        })
