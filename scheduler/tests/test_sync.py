"""Sync — verifies upsert_job adds the right trigger type and full_reconcile loads
all enabled routines.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from bson import ObjectId

import pytest


def _scheduler_stub():
    sched = MagicMock(name='AsyncIOScheduler')
    sched.get_jobs.return_value = []
    return sched


@pytest.mark.asyncio
async def test_upsert_cron_routine_adds_cron_trigger(fake_app_models):
    rid = ObjectId()
    routine = {
        '_id': rid,
        'user_id': ObjectId(),
        'enabled': True,
        'schedule': {
            'kind': 'cron',
            'cron_expr': '*/5 * * * *',
            'timezone': 'UTC',
        },
        'action': {'kind': 'chat', 'prompt': '', 'config_id': 'quick:x'},
        'outputs': {},
    }
    fake_app_models['RoutineModel'].find_by_id.return_value = routine

    from scheduler import sync as sync_mod
    from apscheduler.triggers.cron import CronTrigger

    sched = _scheduler_stub()
    ok = await sync_mod.upsert_job(sched, str(rid))

    assert ok is True
    sched.add_job.assert_called_once()
    kwargs = sched.add_job.call_args.kwargs
    assert isinstance(kwargs['trigger'], CronTrigger)
    assert kwargs['id'] == str(rid)
    assert kwargs['replace_existing'] is True
    assert kwargs['coalesce'] is True
    assert kwargs['max_instances'] == 1
    assert kwargs['args'] == [str(rid)]


@pytest.mark.asyncio
async def test_upsert_one_shot_routine_adds_date_trigger(fake_app_models):
    rid = ObjectId()
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    routine = {
        '_id': rid,
        'user_id': ObjectId(),
        'enabled': True,
        'schedule': {
            'kind': 'one_shot',
            'run_at': future,
            'timezone': 'UTC',
        },
        'action': {'kind': 'chat', 'prompt': '', 'config_id': 'quick:x'},
        'outputs': {},
    }
    fake_app_models['RoutineModel'].find_by_id.return_value = routine

    from scheduler import sync as sync_mod
    from apscheduler.triggers.date import DateTrigger

    sched = _scheduler_stub()
    ok = await sync_mod.upsert_job(sched, str(rid))

    assert ok is True
    kwargs = sched.add_job.call_args.kwargs
    assert isinstance(kwargs['trigger'], DateTrigger)


@pytest.mark.asyncio
async def test_upsert_disabled_routine_calls_delete(fake_app_models):
    rid = ObjectId()
    routine = {
        '_id': rid,
        'user_id': ObjectId(),
        'enabled': False,
        'schedule': {'kind': 'cron', 'cron_expr': '0 * * * *', 'timezone': 'UTC'},
        'action': {},
        'outputs': {},
    }
    fake_app_models['RoutineModel'].find_by_id.return_value = routine

    from scheduler import sync as sync_mod

    sched = _scheduler_stub()
    sched.remove_job = MagicMock()
    ok = await sync_mod.upsert_job(sched, str(rid))

    assert ok is False
    sched.add_job.assert_not_called()
    sched.remove_job.assert_called_once()


@pytest.mark.asyncio
async def test_full_reconcile_loads_all_enabled(fake_app_models):
    """full_reconcile reads all enabled routines and upserts each."""
    rid_a, rid_b = ObjectId(), ObjectId()
    routines = [
        {
            '_id': rid_a,
            'user_id': ObjectId(),
            'enabled': True,
            'schedule': {'kind': 'cron', 'cron_expr': '* * * * *', 'timezone': 'UTC'},
            'action': {},
            'outputs': {},
        },
        {
            '_id': rid_b,
            'user_id': ObjectId(),
            'enabled': True,
            'schedule': {'kind': 'cron', 'cron_expr': '0 0 * * *', 'timezone': 'UTC'},
            'action': {},
            'outputs': {},
        },
    ]

    # find() returns an iterable; full_reconcile wraps it in list()
    fake_app_models['RoutineModel'].get_collection.return_value.find.return_value = iter(routines)
    # find_by_id is what upsert_job uses
    fake_app_models['RoutineModel'].find_by_id.side_effect = lambda rid: next(
        (r for r in routines if str(r['_id']) == str(rid)), None
    )

    from scheduler import sync as sync_mod

    sched = _scheduler_stub()
    loaded = await sync_mod.full_reconcile(sched)

    assert loaded == 2
    assert sched.add_job.call_count == 2
