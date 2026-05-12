"""
Workspace cascade-delete (P0.5).

The pre-existing ``delete_workspace`` route cascaded only ``workspace_members``
and ``workspace_invites``. Everything else — projects, conversations, messages,
workflows, knowledge items, routines, DLP events, credit ledger, usage logs,
groups — kept the dangling ``workspace_id`` reference, skewing billing rollups
and producing orphan rows in cross-company analytics.

This module owns the full cascade. ``cascade_delete(workspace_id)`` walks the
dependency graph leaf-first, deletes everything scoped to that workspace
(directly via ``workspace_id`` or indirectly via a ``project_id`` whose project
belongs to the workspace), and returns the per-collection deletion counts.

Idempotency: re-running on an already-gone workspace returns ``{}`` rather
than raising. Useful for retry-safe callers.

Atomicity: we attempt a Mongo transaction via ``client.start_session()`` +
``session.with_transaction(...)``. If the deployment isn't a replica set
(local dev) the transaction call raises ``OperationFailure``; we fall back to
sequential best-effort deletes and log a warning. The fallback is NOT atomic
but is correct enough for a cascade where every step is monotonic (delete-only,
no swaps).
"""

from __future__ import annotations

import logging
from typing import Optional

from bson import ObjectId
from pymongo.errors import OperationFailure

from app.extensions import mongo

_logger = logging.getLogger(__name__)

# Collections scoped directly by workspace_id.
_WORKSPACE_SCOPED = [
    'workflow_runs',
    'workflows',
    'knowledge_items',
    'knowledge_folders',
    'llm_configs',
    'dlp_events',
    'credit_ledger',
    'usage_logs',
    'project_group_access',
    'group_members',
    'groups',
    'workspace_invites',
    'workspace_members',
]

# Collections scoped indirectly via project_id of a project that lives in the
# workspace. We resolve project_ids first then delete via $in.
_PROJECT_SCOPED = [
    'project_members',
    'project_group_access',  # also has direct workspace_id but cover both
]


def _to_oid(value) -> Optional[ObjectId]:
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def cascade_delete(workspace_id) -> dict:
    """Cascade-delete every resource scoped to ``workspace_id``.

    Returns ``{collection_name: deleted_count}`` for every collection that had
    rows removed. Re-runnable: already-deleted workspaces produce ``{}``.
    """
    wid_obj = _to_oid(workspace_id)
    if wid_obj is None:
        return {}

    # Discover project ids in this workspace before deleting `projects`.
    project_ids = list(
        mongo.db.projects.find({'workspace_id': wid_obj}, {'_id': 1})
    )
    project_oids = [p['_id'] for p in project_ids]

    # Discover conversation ids so we can also nuke messages.
    conv_filter = {'workspace_id': wid_obj}
    conv_ids = list(mongo.db.conversations.find(conv_filter, {'_id': 1}))
    conv_oids = [c['_id'] for c in conv_ids]

    # Discover routine ids so we can nuke routine_runs.
    routine_ids = list(mongo.db.routines.find({'workspace_id': wid_obj}, {'_id': 1}))
    routine_oids = [r['_id'] for r in routine_ids]

    counts: dict = {}

    def _run(session=None) -> None:
        # Leaf rows that reference parents we're about to delete.
        if conv_oids:
            res = mongo.db.messages.delete_many(
                {'conversation_id': {'$in': conv_oids}}, session=session
            )
            if res.deleted_count:
                counts['messages'] = res.deleted_count

        if routine_oids:
            res = mongo.db.routine_runs.delete_many(
                {'routine_id': {'$in': routine_oids}}, session=session
            )
            if res.deleted_count:
                counts['routine_runs'] = res.deleted_count

        res = mongo.db.conversations.delete_many(conv_filter, session=session)
        if res.deleted_count:
            counts['conversations'] = res.deleted_count

        res = mongo.db.routines.delete_many({'workspace_id': wid_obj}, session=session)
        if res.deleted_count:
            counts['routines'] = res.deleted_count

        # Folders that are scoped to user but live "inside" a project of this ws.
        # The simplest correct rule: nuke folders whose owning workspace matches.
        # Knowledge folders carry workspace_id; conversations-folders do too.
        res = mongo.db.folders.delete_many({'workspace_id': wid_obj}, session=session)
        if res.deleted_count:
            counts['folders'] = res.deleted_count

        for coll in _WORKSPACE_SCOPED:
            res = mongo.db[coll].delete_many({'workspace_id': wid_obj}, session=session)
            if res.deleted_count:
                counts[coll] = counts.get(coll, 0) + res.deleted_count

        if project_oids:
            for coll in _PROJECT_SCOPED:
                res = mongo.db[coll].delete_many(
                    {'project_id': {'$in': project_oids}}, session=session
                )
                if res.deleted_count:
                    counts[coll] = counts.get(coll, 0) + res.deleted_count

        # Projects last (before the workspace doc itself).
        res = mongo.db.projects.delete_many({'workspace_id': wid_obj}, session=session)
        if res.deleted_count:
            counts['projects'] = res.deleted_count

        # Finally the workspace doc.
        res = mongo.db.workspaces.delete_one({'_id': wid_obj}, session=session)
        if res.deleted_count:
            counts['workspaces'] = res.deleted_count

    # Try transactional path first. Local dev (single-node Mongo) doesn't
    # support transactions and will raise; fall through to non-transactional.
    try:
        with mongo.cx.start_session() as session:
            session.with_transaction(lambda s: _run(session=s))
            return counts
    except OperationFailure as exc:
        _logger.warning(
            'workspace_cascade: transactions unavailable (%s); falling back to '
            'non-atomic deletes for workspace %s', exc.details or exc, workspace_id
        )
    except Exception as exc:
        _logger.warning(
            'workspace_cascade: transaction start failed (%s); falling back', exc
        )

    # Non-atomic fallback.
    counts.clear()
    _run(session=None)
    return counts
