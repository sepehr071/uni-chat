"""Retry listener — verify second EVENT_JOB_ERROR for the same routine
calls RoutineRunModel.fail and gives up.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

from bson import ObjectId

import pytest


def _scheduler_stub():
    sched = MagicMock(name='AsyncIOScheduler')
    return sched


def _make_event(job_id: str, exc: BaseException):
    return SimpleNamespace(job_id=job_id, exception=exc)


def test_first_failure_schedules_retry(fake_app_models):
    from scheduler import retry as retry_mod

    retry_mod._reset_counts_for_tests()

    rid = str(ObjectId())
    sched = _scheduler_stub()
    listener = retry_mod.make_listener(sched)

    listener(_make_event(rid, RuntimeError('boom')))

    sched.add_job.assert_called_once()
    kwargs = sched.add_job.call_args.kwargs
    assert kwargs['id'].startswith('retry::')
    assert kwargs['args'] == [rid]
    # No fail() yet — we still have hope
    fake_app_models['RoutineRunModel'].fail.assert_not_called()


def test_second_failure_marks_failed(fake_app_models):
    from scheduler import retry as retry_mod

    retry_mod._reset_counts_for_tests()

    rid = str(ObjectId())

    # Mock the find→list→sort→limit chain in _mark_failed_in_db
    runs_doc = {'_id': ObjectId()}
    coll_mock = fake_app_models['RoutineRunModel'].get_collection.return_value
    cursor_mock = MagicMock()
    cursor_mock.sort.return_value = cursor_mock
    cursor_mock.limit.return_value = iter([runs_doc])
    coll_mock.find.return_value = cursor_mock

    sched = _scheduler_stub()
    listener = retry_mod.make_listener(sched)

    # First failure → retry scheduled
    listener(_make_event(rid, RuntimeError('boom 1')))
    assert sched.add_job.call_count == 1

    # Second failure (this time on the retry job id) → give up
    retry_job_id = f'retry::{rid}'
    listener(_make_event(retry_job_id, RuntimeError('boom 2')))

    fake_app_models['RoutineRunModel'].fail.assert_called_once()
    fake_app_models['RoutineModel'].record_run.assert_called_once()
    # No new retry scheduled the second time
    assert sched.add_job.call_count == 1


def test_two_distinct_routines_each_get_one_retry(fake_app_models):
    from scheduler import retry as retry_mod

    retry_mod._reset_counts_for_tests()

    sched = _scheduler_stub()
    listener = retry_mod.make_listener(sched)

    rid_a, rid_b = str(ObjectId()), str(ObjectId())
    listener(_make_event(rid_a, RuntimeError('a')))
    listener(_make_event(rid_b, RuntimeError('b')))

    assert sched.add_job.call_count == 2
    fake_app_models['RoutineRunModel'].fail.assert_not_called()
