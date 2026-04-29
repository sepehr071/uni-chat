"""
RoutineRunModel — execution history for routines.

Collection: routine_runs
Index: (routine_id, started_at DESC)
App-level cap: keep only the latest 50 runs per routine.

Document schema:
  _id           ObjectId
  routine_id    ObjectId
  user_id       ObjectId
  started_at    datetime (UTC, aware)
  finished_at   datetime | None
  status        'running' | 'success' | 'failed' | 'skipped'
  result_text   str | None
  result_meta   {tokens, cost, model} | None
  delivered_to  list[str]           # e.g. ['chat', 'knowledge', 'telegram']
  error         {message, traceback} | None
  retry_count   int
"""

from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo

_MAX_RUNS_PER_ROUTINE = 50


class RoutineRunModel:
    collection_name = 'routine_runs'

    @staticmethod
    def get_collection():
        return mongo.db[RoutineRunModel.collection_name]

    @staticmethod
    def create_indexes():
        col = RoutineRunModel.get_collection()
        col.create_index([('routine_id', ASCENDING), ('started_at', DESCENDING)])

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    @staticmethod
    def start(routine_id: str, user_id: str) -> str | None:
        """
        Insert a new 'running' run document.

        If an existing 'running' row already exists for this routine_id, returns None
        to signal that the new run should be skipped (overlap guard).

        Returns the inserted _id as a string on success.
        """
        col = RoutineRunModel.get_collection()
        existing = col.find_one({'routine_id': ObjectId(routine_id), 'status': 'running'})
        if existing:
            return None

        doc = {
            'routine_id': ObjectId(routine_id),
            'user_id': ObjectId(user_id),
            'started_at': datetime.now(timezone.utc),
            'finished_at': None,
            'status': 'running',
            'result_text': None,
            'result_meta': None,
            'delivered_to': [],
            'error': None,
            'retry_count': 0,
        }
        result = col.insert_one(doc)
        return str(result.inserted_id)

    @staticmethod
    def complete(
        run_id: str,
        status: str,
        result_text: str | None = None,
        result_meta: dict | None = None,
        delivered_to: list | None = None,
    ) -> None:
        """Mark a run as success (or any terminal status)."""
        RoutineRunModel.get_collection().update_one(
            {'_id': ObjectId(run_id)},
            {'$set': {
                'status': status,
                'finished_at': datetime.now(timezone.utc),
                'result_text': result_text,
                'result_meta': result_meta,
                'delivered_to': delivered_to or [],
            }},
        )

    @staticmethod
    def fail(run_id: str, error_msg: str, traceback: str | None = None, retry_count: int = 0) -> None:
        """Mark a run as failed with error details."""
        RoutineRunModel.get_collection().update_one(
            {'_id': ObjectId(run_id)},
            {'$set': {
                'status': 'failed',
                'finished_at': datetime.now(timezone.utc),
                'error': {'message': error_msg, 'traceback': traceback},
                'retry_count': retry_count,
            }},
        )

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    @staticmethod
    def find_by_routine(routine_id: str, limit: int = 50) -> list:
        cursor = (
            RoutineRunModel.get_collection()
            .find({'routine_id': ObjectId(routine_id)})
            .sort('started_at', DESCENDING)
            .limit(limit)
        )
        return list(cursor)

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    @staticmethod
    def purge_to_50(routine_id: str) -> None:
        """Delete all but the 50 most-recent runs for a routine."""
        col = RoutineRunModel.get_collection()
        # Find the 50th run's started_at
        runs = list(
            col.find(
                {'routine_id': ObjectId(routine_id)},
                {'_id': 1, 'started_at': 1},
            )
            .sort('started_at', DESCENDING)
            .skip(_MAX_RUNS_PER_ROUTINE - 1)
            .limit(1)
        )
        if not runs:
            return  # fewer than 50 runs — nothing to purge
        cutoff = runs[0]['started_at']
        col.delete_many({
            'routine_id': ObjectId(routine_id),
            'started_at': {'$lt': cutoff},
        })
