"""
RoutineModel — scheduled LLM task documents.

Collection: routines
Indexes:
  - (user_id, created_at DESC)
  - (enabled, next_run_at)
  - (user_id, project_id, created_at DESC)

Document schema (all fields):
  _id            ObjectId
  user_id        ObjectId
  project_id     ObjectId | None  # None = personal-scope; set = project-scoped routine
  name           str
  description    str | None
  enabled        bool
  schedule       {
    kind          'cron' | 'one_shot'
    cron_expr     str             # 5-field cron, present for kind='cron'
    cron_source   'preset' | 'natural' | 'raw'
    natural_input str | None      # original NL text if cron_source='natural'
    run_at        datetime | None # one_shot only
    timezone      str             # IANA tz string, snapshot at create time
  }
  action         {
    kind          'chat' | 'workflow'
    # chat:
    prompt        str
    config_id     str             # 'quick:...' or assistant ObjectId string
    # workflow:
    workflow_id   ObjectId | None
    workflow_inputs dict
  }
  outputs        {
    chat:      { enabled: bool, conversation_id: ObjectId | None }
    knowledge: { enabled: bool, folder_id: ObjectId | None }
    telegram:  { enabled: bool }
  }
  next_run_at    datetime | None
  last_run_at    datetime | None
  last_run_status str | None      # 'success' | 'failed' | 'skipped'
  created_at     datetime
  updated_at     datetime
"""

import logging
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo

logger = logging.getLogger(__name__)

# Per-user routine limit for non-admin users
MAX_ROUTINES_PER_USER = 20


class RoutineModel:
    collection_name = 'routines'

    @staticmethod
    def get_collection():
        return mongo.db[RoutineModel.collection_name]

    @staticmethod
    def create_indexes():
        col = RoutineModel.get_collection()
        col.create_index([('user_id', ASCENDING), ('created_at', DESCENDING)])
        col.create_index([('enabled', ASCENDING), ('next_run_at', ASCENDING)])
        col.create_index([('user_id', ASCENDING), ('project_id', ASCENDING), ('created_at', DESCENDING)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(user_id: str, data: dict) -> str:
        """
        Insert a new routine document.

        data keys (validated by route before calling):
          name, description, enabled, schedule, action, outputs, project_id (optional)
        Returns inserted _id as string.
        """
        # Normalise project_id: non-empty string → ObjectId; anything else → None
        raw_pid = data.get('project_id')
        if raw_pid and isinstance(raw_pid, str):
            project_id = ObjectId(raw_pid)
        else:
            project_id = None

        now = datetime.now(timezone.utc)
        doc = {
            'user_id': ObjectId(user_id),
            'project_id': project_id,
            'name': data['name'],
            'description': data.get('description'),
            'enabled': data.get('enabled', True),
            'schedule': data['schedule'],
            'action': data['action'],
            'outputs': data.get('outputs', {
                'chat': {'enabled': False, 'conversation_id': None},
                'knowledge': {'enabled': False, 'folder_id': None},
                'telegram': {'enabled': False},
            }),
            'next_run_at': data.get('next_run_at'),
            'last_run_at': None,
            'last_run_status': None,
            'created_at': now,
            'updated_at': now,
        }
        result = RoutineModel.get_collection().insert_one(doc)
        return str(result.inserted_id)

    @staticmethod
    def find_by_id(routine_id: str) -> dict | None:
        try:
            return RoutineModel.get_collection().find_one({'_id': ObjectId(routine_id)})
        except Exception:
            return None

    @staticmethod
    def find_by_user(user_id: str, skip: int = 0, limit: int = 100) -> list:
        cursor = (
            RoutineModel.get_collection()
            .find({'user_id': ObjectId(user_id)})
            .sort('created_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def find_by_user_and_project(user_id: str, project_id, skip: int = 0, limit: int = 100) -> list:
        """Filter routines by project_id scope.

        project_id values:
          '__any__'   — no project filter (return all user's routines)
          None        — return only personal-scope routines (project_id is None)
          '<hex>'     — return routines for that specific project
        """
        query: dict = {'user_id': ObjectId(user_id)}
        if project_id is None:
            query['project_id'] = None
        elif project_id != '__any__':
            query['project_id'] = ObjectId(project_id)
        cursor = (
            RoutineModel.get_collection()
            .find(query)
            .sort('created_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def update(routine_id: str, user_id: str, data: dict) -> bool:
        """Update mutable fields. Returns True if a document was matched."""
        # Normalise project_id if caller is changing it
        if 'project_id' in data:
            raw_pid = data['project_id']
            if raw_pid and isinstance(raw_pid, str):
                data['project_id'] = ObjectId(raw_pid)
            else:
                data['project_id'] = None
        data['updated_at'] = datetime.now(timezone.utc)
        result = RoutineModel.get_collection().update_one(
            {'_id': ObjectId(routine_id), 'user_id': ObjectId(user_id)},
            {'$set': data},
        )
        return result.matched_count > 0

    @staticmethod
    def delete(routine_id: str, user_id: str) -> bool:
        """Delete a routine. Returns True if deleted."""
        result = RoutineModel.get_collection().delete_one(
            {'_id': ObjectId(routine_id), 'user_id': ObjectId(user_id)}
        )
        return result.deleted_count > 0

    @staticmethod
    def set_enabled(routine_id: str, user_id: str, enabled: bool) -> bool:
        """Toggle enabled flag. Returns True if matched."""
        result = RoutineModel.get_collection().update_one(
            {'_id': ObjectId(routine_id), 'user_id': ObjectId(user_id)},
            {'$set': {'enabled': enabled, 'updated_at': datetime.now(timezone.utc)}},
        )
        return result.matched_count > 0

    @staticmethod
    def count_active_for_user(user_id: str) -> int:
        """Count routines where enabled=True for a given user (for limit enforcement)."""
        return RoutineModel.get_collection().count_documents(
            {'user_id': ObjectId(user_id), 'enabled': True}
        )

    # ------------------------------------------------------------------
    # Scheduler helpers
    # ------------------------------------------------------------------

    @staticmethod
    def compute_next_run_at(cron_expr: str, tz_str: str) -> datetime | None:
        """
        Compute the next scheduled fire time for a cron expression in the given timezone.

        Returns a timezone-aware datetime in UTC, or None on any error.
        """
        try:
            from croniter import croniter
            import zoneinfo

            tz = zoneinfo.ZoneInfo(tz_str)
            now_local = datetime.now(tz)
            cron = croniter(cron_expr, now_local)
            next_dt = cron.get_next(datetime)
            # croniter returns naive dt in the local tz — make it aware then convert to UTC
            if next_dt.tzinfo is None:
                next_dt = next_dt.replace(tzinfo=tz)
            return next_dt.astimezone(timezone.utc)
        except Exception as exc:
            logger.warning('compute_next_run_at failed (cron=%s, tz=%s): %s', cron_expr, tz_str, exc)
            return None

    @staticmethod
    def record_run(routine_id: str, status: str, finished_at: datetime) -> None:
        """Update last_run_at and last_run_status after a run completes."""
        RoutineModel.get_collection().update_one(
            {'_id': ObjectId(routine_id)},
            {'$set': {
                'last_run_at': finished_at,
                'last_run_status': status,
                'updated_at': datetime.now(timezone.utc),
            }},
        )
