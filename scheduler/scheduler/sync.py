"""Reconciliation between the `routines` collection and APScheduler's job table.

Three entry points used elsewhere in the service::

    upsert_job(scheduler, routine_id)  # one routine
    delete_job(scheduler, routine_id)  # one routine
    full_reconcile(scheduler)          # boot-time sweep
    tick(scheduler)                    # periodic 30s sweep

`scheduler` is an `apscheduler.schedulers.asyncio.AsyncIOScheduler`. All async
because executor + aiohttp share a single event loop.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from scheduler.flask_ctx import flask_app

logger = logging.getLogger('unichat-scheduler.sync')


# ---------------------------------------------------------------------------
# Trigger building
# ---------------------------------------------------------------------------

def _build_trigger(routine: dict) -> Optional[object]:
    """Build a CronTrigger or DateTrigger from a routine document.

    Returns None if the schedule is malformed or expired.
    """
    schedule = routine.get('schedule') or {}
    kind = schedule.get('kind')
    tz = schedule.get('timezone') or 'UTC'

    if kind == 'cron':
        cron_expr = schedule.get('cron_expr')
        if not cron_expr:
            logger.warning('routine %s has cron schedule but no cron_expr', routine.get('_id'))
            return None
        try:
            return CronTrigger.from_crontab(cron_expr, timezone=tz)
        except Exception as exc:
            logger.warning('routine %s cron parse failed (%s): %s', routine.get('_id'), cron_expr, exc)
            return None

    if kind == 'one_shot':
        run_at = schedule.get('run_at')
        if not run_at:
            logger.warning('routine %s has one_shot schedule but no run_at', routine.get('_id'))
            return None
        # Mongo returns naive UTC datetimes; treat as UTC for safety
        if isinstance(run_at, datetime) and run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=timezone.utc)
        # Skip past one-shots
        if isinstance(run_at, datetime) and run_at <= datetime.now(timezone.utc):
            logger.info('routine %s one_shot run_at is in the past, skipping', routine.get('_id'))
            return None
        return DateTrigger(run_date=run_at, timezone=tz)

    logger.warning('routine %s has unknown schedule.kind=%r', routine.get('_id'), kind)
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def upsert_job(scheduler, routine_id: str) -> bool:
    """Re-load a single routine into APScheduler.

    Loads the doc, builds the trigger, replaces any existing job with the same id.
    Returns True if a job was added/replaced, False otherwise (disabled / missing /
    bad schedule).
    """
    from app.models.routine import RoutineModel

    with flask_app.app_context():
        routine = RoutineModel.find_by_id(routine_id)

    if not routine:
        # Routine was deleted between notify and load — make sure no stale job lingers
        await delete_job(scheduler, routine_id)
        return False

    if not routine.get('enabled', True):
        await delete_job(scheduler, routine_id)
        return False

    trigger = _build_trigger(routine)
    if trigger is None:
        await delete_job(scheduler, routine_id)
        return False

    job_id = str(routine['_id'])
    scheduler.add_job(
        'scheduler.executor:run_routine',
        trigger=trigger,
        id=job_id,
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=300,
        max_instances=1,
        args=[job_id],
    )
    logger.info('upsert_job: %s (kind=%s)', job_id, routine.get('schedule', {}).get('kind'))
    return True


async def delete_job(scheduler, routine_id: str) -> None:
    """Remove a routine's job from APScheduler if present."""
    job_id = str(routine_id)
    try:
        scheduler.remove_job(job_id)
        logger.info('delete_job: %s', job_id)
    except Exception:
        # remove_job raises JobLookupError if missing — that's fine
        pass


async def full_reconcile(scheduler) -> int:
    """On startup, load every enabled routine into APScheduler. Returns count loaded."""
    from app.models.routine import RoutineModel

    with flask_app.app_context():
        cursor = RoutineModel.get_collection().find({'enabled': True})
        routines = list(cursor)

    loaded = 0
    for routine in routines:
        if await upsert_job(scheduler, str(routine['_id'])):
            loaded += 1

    logger.info('full_reconcile: loaded %d routines', loaded)
    return loaded


async def tick(scheduler) -> None:
    """Cheap periodic reconcile: drop jobs that point at deleted/disabled routines,
    and add jobs for any enabled routine that's missing.
    """
    from app.models.routine import RoutineModel

    with flask_app.app_context():
        enabled = list(RoutineModel.get_collection().find(
            {'enabled': True}, {'_id': 1}
        ))

    enabled_ids = {str(r['_id']) for r in enabled}
    job_ids = {job.id for job in scheduler.get_jobs()}

    to_add = enabled_ids - job_ids
    to_remove = job_ids - enabled_ids

    for rid in to_add:
        await upsert_job(scheduler, rid)
    for rid in to_remove:
        await delete_job(scheduler, rid)

    if to_add or to_remove:
        logger.info('tick: +%d -%d (total=%d)', len(to_add), len(to_remove), len(enabled_ids))
