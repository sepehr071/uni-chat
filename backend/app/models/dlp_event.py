"""
DLP event model — stores detection events from DLP scans.

Document shape:
    {
      _id, user_id, workspace_id, project_id,
      source: 'chat' | 'arena' | 'workflow' | 'helper' | 'image_prompt' | 'meeting' | 'debate' | 'automate' | 'bot' | 'routine',
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

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo

logger = logging.getLogger(__name__)

# Whitelist of allowed `source_ref` top-level keys. Anything else is dropped
# with a debug log (typo catcher). Keep this list narrow — every key flowing
# into the DB should have a documented purpose in the source enum docstring.
_ALLOWED_SOURCE_REF_KEYS = frozenset({
    'workflow_id',
    'node_id',
    'field',
    'meeting_id',
    'phase',
    'artifact',
    'session_id',
    'route',
    'preflight',
    'task_id',
    'knowledge_folder_id',
    'kind',
    # Used by image_generation.py — feature identifier + provider model id are
    # both useful drill-downs in the admin dashboard.
    'feature',
    'model',
    # Already-present keys from the original schema docstring kept for
    # backward compatibility with existing call sites.
    'conversation_id',
    'message_id',
    'run_id',
})

# Hard cap on the JSON-serialized size of `source_ref`. 512 bytes is plenty
# for ~10 short string IDs; anything larger likely indicates accidental dump
# of payload data into source_ref.
_SOURCE_REF_MAX_BYTES = 512


def _sanitize_source_ref(d: Optional[dict]) -> dict:
    """Whitelist + bound-size `source_ref` before persisting.

    1. Keep only whitelisted top-level keys. Drop unknown keys with a debug
       log so typos surface during dev without spamming production logs.
    2. If the JSON-serialized form exceeds ``_SOURCE_REF_MAX_BYTES``, truncate
       string values starting with the longest until the doc fits under the
       cap. Non-string values are left untouched (they're already small).
    """
    if not d or not isinstance(d, dict):
        return {}

    clean: dict = {}
    for key, value in d.items():
        if key in _ALLOWED_SOURCE_REF_KEYS:
            clean[key] = value
        else:
            logger.debug("DLP source_ref: dropping unknown key %r", key)

    try:
        size = len(json.dumps(clean, default=str).encode('utf-8'))
    except (TypeError, ValueError):
        # Non-JSON-serializable — fall back to coercing values to str.
        clean = {k: str(v) for k, v in clean.items()}
        size = len(json.dumps(clean).encode('utf-8'))

    if size <= _SOURCE_REF_MAX_BYTES:
        return clean

    # Repeatedly truncate the longest string value until under cap. Bound the
    # loop with a fixed iteration count so a pathological input can't spin.
    for _ in range(32):
        str_keys = [k for k, v in clean.items() if isinstance(v, str)]
        if not str_keys:
            break
        longest = max(str_keys, key=lambda k: len(clean[k]))
        if len(clean[longest]) <= 8:
            break
        clean[longest] = clean[longest][: max(8, len(clean[longest]) // 2)]
        try:
            size = len(json.dumps(clean, default=str).encode('utf-8'))
        except (TypeError, ValueError):
            break
        if size <= _SOURCE_REF_MAX_BYTES:
            break

    return clean

VALID_STATUSES = {'open', 'reviewed', 'dismissed', 'escalated'}
VALID_SOURCES = {
    'chat',
    'arena',
    'workflow',
    'helper',
    'image_prompt',
    'meeting',
    'debate',
    'automate',
    'bot',
    'routine',
}
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

    # Dedup window — pre-flight `/dlp/scan` + downstream chokepoint (chat_stream
    # etc.) both call create() for the same single user action with the same
    # text_sha256. Within this window we merge into the existing row instead of
    # writing a second one.
    _DEDUP_WINDOW_SECONDS = 60

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
        """Insert a new DLP event and return the inserted document.

        Deduplication: within ``_DEDUP_WINDOW_SECONDS`` of an existing event
        with the same ``(user_id, workspace_id, source, text_sha256)`` tuple,
        skip the insert and instead merge into the existing row. ``was_sent``
        is OR-merged (True wins — "was sent" is stronger evidence than
        "pre-flight only"). ``user_acknowledged`` is OR-merged for the same
        reason. The existing row is returned (with merged fields applied).
        """
        if source not in VALID_SOURCES:
            raise ValueError(f"Invalid source: {source!r}. Must be one of {VALID_SOURCES}")
        if highest_action not in VALID_ACTIONS:
            raise ValueError(f"Invalid highest_action: {highest_action!r}")
        if status not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {status!r}")

        col = DLPEventModel.get_collection()

        # --- Dedup pre-check -------------------------------------------------
        # Match the same single user action: same user, same workspace, same
        # source, same text fingerprint, within the dedup window.
        cutoff = datetime.utcnow() - timedelta(seconds=DLPEventModel._DEDUP_WINDOW_SECONDS)
        dedup_query = {
            'user_id': _to_oid(user_id),
            'workspace_id': _to_oid(workspace_id),
            'source': source,
            'text_sha256': str(text_sha256),
            'created_at': {'$gte': cutoff},
        }
        existing = col.find_one(dedup_query, sort=[('created_at', DESCENDING)])
        if existing is not None:
            # Merge permissively: was_sent True wins over False, ack True wins
            # over False. highest_action takes the stronger of the two so
            # downstream dashboards reflect the actual escalation. Matches
            # untouched — the pre-flight match list is already the canonical
            # snapshot for this text.
            new_was_sent = bool(existing.get('was_sent', False)) or bool(was_sent)
            new_ack = (
                bool(existing.get('user_acknowledged', False))
                or bool(user_acknowledged)
            )

            action_rank = {'allow': 0, 'warn': 1, 'require_confirm': 2, 'block': 3}
            existing_action = existing.get('highest_action', 'allow')
            new_action = highest_action if (
                action_rank.get(highest_action, 0) > action_rank.get(existing_action, 0)
            ) else existing_action

            updates: dict = {}
            if new_was_sent != existing.get('was_sent'):
                updates['was_sent'] = new_was_sent
            if new_ack != existing.get('user_acknowledged'):
                updates['user_acknowledged'] = new_ack
            if new_action != existing_action:
                updates['highest_action'] = new_action
            if updates:
                col.update_one({'_id': existing['_id']}, {'$set': updates})
                existing.update(updates)
            return existing

        doc = {
            'user_id': _to_oid(user_id),
            'workspace_id': _to_oid(workspace_id),
            'project_id': _to_oid(project_id),  # None is valid
            'source': source,
            'source_ref': _sanitize_source_ref(source_ref),
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

        result = col.insert_one(doc)
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
            by_source: {chat, arena, workflow, helper, image_prompt, meeting, debate, automate, bot, routine: int},
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
