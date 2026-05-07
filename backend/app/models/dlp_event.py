"""
DLP event model — stores detection events from DLP scans.

Document shape:
    {
      _id, user_id, workspace_id, project_id,
      source: 'chat' | 'arena' | 'workflow',
      source_ref: { conversation_id?, message_id?, workflow_id?, run_id?, node_id? },
      matches: [{ rule_id, rule_name, severity, action_taken, snippet, offset_start, offset_end }],
      highest_action: 'warn' | 'require_confirm' | 'block',
      was_sent: bool,
      user_acknowledged: bool,
      text_sha256: str,
      text_length: int,
      status: 'open' | 'reviewed' | 'dismissed' | 'escalated',
      reviewed_by, reviewed_at, review_note,
      created_at
    }
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo

VALID_STATUSES = {'open', 'reviewed', 'dismissed', 'escalated'}
VALID_SOURCES = {'chat', 'arena', 'workflow'}
VALID_ACTIONS = {'allow', 'warn', 'require_confirm', 'block'}
VALID_SEVERITIES = {'low', 'medium', 'high', 'critical'}


def _to_oid(v) -> Optional[ObjectId]:
    """Coerce str or ObjectId to ObjectId; return None if v is None."""
    if v is None:
        return None
    if isinstance(v, ObjectId):
        return v
    return ObjectId(v)


def _parse_dt(v) -> Optional[datetime]:
    """Coerce ISO string or datetime to datetime; return None if v is None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v))


class DLPEventModel:
    COLLECTION = 'dlp_events'

    @staticmethod
    def get_collection():
        return mongo.db[DLPEventModel.COLLECTION]

    @staticmethod
    def create_indexes() -> None:
        col = DLPEventModel.get_collection()
        # Primary query pattern: per-workspace event list sorted by time
        col.create_index([('workspace_id', ASCENDING), ('created_at', DESCENDING)])
        # Status filter within workspace
        col.create_index([
            ('workspace_id', ASCENDING),
            ('status', ASCENDING),
            ('created_at', DESCENDING),
        ])
        # Per-user lookup
        col.create_index([('user_id', ASCENDING), ('created_at', DESCENDING)])
        # Action-level filter
        col.create_index([('highest_action', ASCENDING), ('created_at', DESCENDING)])
        # Cross-cutting workspace filter (for admin cross-workspace)
        col.create_index([('workspace_id', ASCENDING)])
        # Source-ref pivots (sparse — only chat events have conversation_id)
        col.create_index('source_ref.conversation_id', sparse=True)
        col.create_index('source_ref.workflow_id', sparse=True)
        col.create_index('source_ref.run_id', sparse=True)

    @staticmethod
    def create(
        *,
        user_id,
        workspace_id,
        project_id,
        source: str,
        source_ref: dict,
        matches: list[dict],
        highest_action: str,
        was_sent: bool,
        text_sha256: str,
        text_length: int,
        user_acknowledged: bool = False,
        status: str = 'open',
    ) -> dict:
        """Insert a new DLP event and return the inserted document."""
        if source not in VALID_SOURCES:
            raise ValueError(f"Invalid source: {source!r}. Must be one of {VALID_SOURCES}")
        if highest_action not in VALID_ACTIONS:
            raise ValueError(f"Invalid highest_action: {highest_action!r}")
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {status!r}")

        doc = {
            'user_id': _to_oid(user_id),
            'workspace_id': _to_oid(workspace_id),
            'project_id': _to_oid(project_id),  # None is valid
            'source': source,
            'source_ref': source_ref or {},
            'matches': matches or [],
            'highest_action': highest_action,
            'was_sent': bool(was_sent),
            'user_acknowledged': bool(user_acknowledged),
            'text_sha256': str(text_sha256),
            'text_length': int(text_length),
            'status': status,
            'reviewed_by': None,
            'reviewed_at': None,
            'review_note': None,
            'created_at': datetime.utcnow(),
        }

        result = DLPEventModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_id(event_id) -> Optional[dict]:
        return DLPEventModel.get_collection().find_one({'_id': _to_oid(event_id)})

    @staticmethod
    def find_by_workspace(
        workspace_id,
        *,
        user_id=None,
        severity: Optional[str] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        action: Optional[str] = None,
        from_dt=None,
        to_dt=None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        """Return (rows, total_count) filtered for one workspace."""
        query: dict = {'workspace_id': _to_oid(workspace_id)}

        if user_id is not None:
            query['user_id'] = _to_oid(user_id)
        if severity is not None:
            query['matches.severity'] = severity
        if source is not None:
            query['source'] = source
        if status is not None:
            query['status'] = status
        if action is not None:
            query['highest_action'] = action

        dt_filter: dict = {}
        if from_dt is not None:
            dt_filter['$gte'] = _parse_dt(from_dt)
        if to_dt is not None:
            dt_filter['$lte'] = _parse_dt(to_dt)
        if dt_filter:
            query['created_at'] = dt_filter

        col = DLPEventModel.get_collection()
        total = col.count_documents(query)
        rows = list(
            col.find(query)
            .sort('created_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return rows, total

    @staticmethod
    def find_all(
        *,
        user_id=None,
        workspace_id=None,
        severity: Optional[str] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        action: Optional[str] = None,
        from_dt=None,
        to_dt=None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        """Cross-workspace variant for platform admin."""
        query: dict = {}

        if workspace_id is not None:
            query['workspace_id'] = _to_oid(workspace_id)
        if user_id is not None:
            query['user_id'] = _to_oid(user_id)
        if severity is not None:
            query['matches.severity'] = severity
        if source is not None:
            query['source'] = source
        if status is not None:
            query['status'] = status
        if action is not None:
            query['highest_action'] = action

        dt_filter: dict = {}
        if from_dt is not None:
            dt_filter['$gte'] = _parse_dt(from_dt)
        if to_dt is not None:
            dt_filter['$lte'] = _parse_dt(to_dt)
        if dt_filter:
            query['created_at'] = dt_filter

        col = DLPEventModel.get_collection()
        total = col.count_documents(query)
        rows = list(
            col.find(query)
            .sort('created_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return rows, total

    @staticmethod
    def update_review(
        event_id,
        *,
        reviewer_id,
        status: str,
        review_note: Optional[str] = None,
    ) -> Optional[dict]:
        """Update the review fields on an event. Returns updated doc or None."""
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {status!r}. Must be one of {VALID_STATUSES}")

        if review_note is not None:
            review_note = str(review_note)[:1000]

        update = {
            '$set': {
                'status': status,
                'reviewed_by': _to_oid(reviewer_id),
                'reviewed_at': datetime.utcnow(),
                'review_note': review_note,
            }
        }

        col = DLPEventModel.get_collection()
        col.update_one({'_id': _to_oid(event_id)}, update)
        return col.find_one({'_id': _to_oid(event_id)})

    @staticmethod
    def aggregate_workspace_stats(workspace_id, days: int = 7) -> dict:
        """
        Returns aggregation stats for a workspace over the last `days` days.

        Shape:
        {
            total: int,
            by_severity: {low, medium, high, critical: int},
            by_source: {chat, arena, workflow: int},
            top_users: [{user_id, count}],      # top 10
            top_rules: [{rule_id, count}],       # top 10
            daily: [{date: 'YYYY-MM-DD', count}] # last `days` days
        }
        """
        col = DLPEventModel.get_collection()
        since = datetime.utcnow() - timedelta(days=days)
        match_stage = {
            '$match': {
                'workspace_id': _to_oid(workspace_id),
                'created_at': {'$gte': since},
            }
        }

        # Total
        total = col.count_documents({
            'workspace_id': _to_oid(workspace_id),
            'created_at': {'$gte': since},
        })

        # by_severity — unwind matches array
        sev_pipeline = [
            match_stage,
            {'$unwind': '$matches'},
            {'$group': {'_id': '$matches.severity', 'count': {'$sum': 1}}},
        ]
        by_severity: dict[str, int] = {s: 0 for s in VALID_SEVERITIES}
        for row in col.aggregate(sev_pipeline):
            if row['_id'] in by_severity:
                by_severity[row['_id']] = row['count']

        # by_source
        src_pipeline = [
            match_stage,
            {'$group': {'_id': '$source', 'count': {'$sum': 1}}},
        ]
        by_source: dict[str, int] = {s: 0 for s in VALID_SOURCES}
        for row in col.aggregate(src_pipeline):
            if row['_id'] in by_source:
                by_source[row['_id']] = row['count']

        # top_users
        user_pipeline = [
            match_stage,
            {'$group': {'_id': '$user_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10},
        ]
        top_users = [
            {'user_id': str(r['_id']), 'count': r['count']}
            for r in col.aggregate(user_pipeline)
        ]

        # top_rules — unwind matches
        rule_pipeline = [
            match_stage,
            {'$unwind': '$matches'},
            {'$group': {'_id': '$matches.rule_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10},
        ]
        top_rules = [
            {'rule_id': r['_id'], 'count': r['count']}
            for r in col.aggregate(rule_pipeline)
        ]

        # daily buckets
        daily_pipeline = [
            match_stage,
            {
                '$group': {
                    '_id': {
                        '$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}
                    },
                    'count': {'$sum': 1},
                }
            },
            {'$sort': {'_id': 1}},
        ]
        daily = [{'date': r['_id'], 'count': r['count']} for r in col.aggregate(daily_pipeline)]

        return {
            'total': total,
            'by_severity': by_severity,
            'by_source': by_source,
            'top_users': top_users,
            'top_rules': top_rules,
            'daily': daily,
        }

    @staticmethod
    def aggregate_global_stats(days: int = 7) -> dict:
        """
        Cross-workspace stats for platform admin.
        Same shape as aggregate_workspace_stats plus:
            top_workspaces: [{workspace_id, name, count}]
        """
        col = DLPEventModel.get_collection()
        since = datetime.utcnow() - timedelta(days=days)
        match_stage = {'$match': {'created_at': {'$gte': since}}}

        total = col.count_documents({'created_at': {'$gte': since}})

        # by_severity
        sev_pipeline = [
            match_stage,
            {'$unwind': '$matches'},
            {'$group': {'_id': '$matches.severity', 'count': {'$sum': 1}}},
        ]
        by_severity: dict[str, int] = {s: 0 for s in VALID_SEVERITIES}
        for row in col.aggregate(sev_pipeline):
            if row['_id'] in by_severity:
                by_severity[row['_id']] = row['count']

        # by_source
        src_pipeline = [
            match_stage,
            {'$group': {'_id': '$source', 'count': {'$sum': 1}}},
        ]
        by_source: dict[str, int] = {s: 0 for s in VALID_SOURCES}
        for row in col.aggregate(src_pipeline):
            if row['_id'] in by_source:
                by_source[row['_id']] = row['count']

        # by_action
        action_pipeline = [
            match_stage,
            {'$group': {'_id': '$highest_action', 'count': {'$sum': 1}}},
        ]
        by_action: dict[str, int] = {a: 0 for a in ('block', 'require_confirm', 'warn')}
        for row in col.aggregate(action_pipeline):
            if row['_id'] in by_action:
                by_action[row['_id']] = row['count']

        # top_users
        user_pipeline = [
            match_stage,
            {'$group': {'_id': '$user_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10},
        ]
        top_users = [
            {'user_id': str(r['_id']), 'count': r['count']}
            for r in col.aggregate(user_pipeline)
        ]

        # top_rules
        rule_pipeline = [
            match_stage,
            {'$unwind': '$matches'},
            {'$group': {'_id': '$matches.rule_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10},
        ]
        top_rules = [
            {'rule_id': r['_id'], 'count': r['count']}
            for r in col.aggregate(rule_pipeline)
        ]

        # daily
        daily_pipeline = [
            match_stage,
            {
                '$group': {
                    '_id': {
                        '$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}
                    },
                    'count': {'$sum': 1},
                }
            },
            {'$sort': {'_id': 1}},
        ]
        daily = [{'date': r['_id'], 'count': r['count']} for r in col.aggregate(daily_pipeline)]

        # top_workspaces — join with workspaces collection for name
        ws_pipeline = [
            match_stage,
            {'$group': {'_id': '$workspace_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10},
            {
                '$lookup': {
                    'from': 'workspaces',
                    'localField': '_id',
                    'foreignField': '_id',
                    'as': 'ws',
                }
            },
            {'$unwind': {'path': '$ws', 'preserveNullAndEmptyArrays': True}},
        ]
        top_workspaces = [
            {
                'workspace_id': str(r['_id']),
                'name': (r.get('ws') or {}).get('name', ''),
                'count': r['count'],
            }
            for r in col.aggregate(ws_pipeline)
        ]

        return {
            'total': total,
            'by_severity': by_severity,
            'by_source': by_source,
            'by_action': by_action,
            'top_users': top_users,
            'top_rules': top_rules,
            'daily': daily,
            'top_workspaces': top_workspaces,
        }
