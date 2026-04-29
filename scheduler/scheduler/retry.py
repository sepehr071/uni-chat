"""APScheduler EVENT_JOB_ERROR listener.

Policy (matches the plan):
* On the first failure of a routine job, schedule a one-shot retry +60s with a
  retry_count=1 marker. The retry job id encodes the original routine id.
* On a second failure for the same routine within a short window, mark the
  routine_run row as failed (retry_count=2) and give up.

In-memory state — this is fine because APScheduler restarts will pull fresh
routine_runs from Mongo and the persisted retry job (if any) lives in the
job store.
"""
import logging
from datetime import datetime, timedelta, timezone

from apscheduler.events import EVENT_JOB_ERROR
from apscheduler.triggers.date import DateTrigger

from scheduler.flask_ctx import flask_app

logger = logging.getLogger('unichat-scheduler.retry')

_RETRY_PREFIX = 'retry::'
_RETRY_DELAY_SECONDS = 60

# Track which routines have already had their one retry consumed.
# routine_id -> count of failures observed so far (1 = retry scheduled, 2 = give up)
_failure_counts: dict[str, int] = {}


def _routine_id_from_job(event_job_id: str) -> str:
    """Strip the retry prefix if present so we always reason about the underlying routine."""
    if event_job_id.startswith(_RETRY_PREFIX):
        return event_job_id[len(_RETRY_PREFIX):]
    return event_job_id


def _mark_failed_in_db(routine_id: str, retry_count: int, exc: BaseException) -> None:
    """Update the most recent routine_run row to status=failed."""
    from bson import ObjectId
    from app.models.routine_run import RoutineRunModel
    from app.models.routine import RoutineModel

    with flask_app.app_context():
        col = RoutineRunModel.get_collection()
        latest = list(
            col.find({'routine_id': ObjectId(routine_id)})
            .sort('started_at', -1)
            .limit(1)
        )
        if latest:
            RoutineRunModel.fail(
                run_id=str(latest[0]['_id']),
                error_msg=str(exc),
                retry_count=retry_count,
            )
        RoutineModel.record_run(
            routine_id,
            status='failed',
            finished_at=datetime.now(timezone.utc),
        )


def make_listener(scheduler):
    """Return a listener function bound to the given AsyncIOScheduler instance."""

    def _on_error(event):
        original_id = _routine_id_from_job(event.job_id)
        exc = event.exception
        _failure_counts[original_id] = _failure_counts.get(original_id, 0) + 1
        count = _failure_counts[original_id]

        logger.warning('routine %s failed (attempt %d): %s', original_id, count, exc)

        if count < 2:
            # Schedule one-shot retry +60s. Use the same target callable, distinct id.
            retry_at = datetime.now(timezone.utc) + timedelta(seconds=_RETRY_DELAY_SECONDS)
            try:
                scheduler.add_job(
                    'scheduler.executor:run_routine',
                    trigger=DateTrigger(run_date=retry_at),
                    id=f'{_RETRY_PREFIX}{original_id}',
                    replace_existing=True,
                    args=[original_id],
                    misfire_grace_time=120,
                )
                logger.info('retry scheduled for routine %s at %s', original_id, retry_at.isoformat())
            except Exception as add_exc:
                logger.error('failed to schedule retry for %s: %s', original_id, add_exc)
                _mark_failed_in_db(original_id, retry_count=count, exc=exc)
                _failure_counts.pop(original_id, None)
            return

        # Second failure: give up.
        try:
            _mark_failed_in_db(original_id, retry_count=count, exc=exc)
        finally:
            _failure_counts.pop(original_id, None)

    return _on_error


def install(scheduler) -> None:
    """Attach the listener to the given AsyncIOScheduler."""
    scheduler.add_listener(make_listener(scheduler), EVENT_JOB_ERROR)
    logger.info('retry listener installed')


# Test hooks --------------------------------------------------------------

def _reset_counts_for_tests() -> None:
    _failure_counts.clear()
