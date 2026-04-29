"""Executor — verifies the chat path orchestrates correctly.

Mocks every backend call:
* RoutineModel.find_by_id  -> minimal routine doc
* RoutineRunModel.start    -> 'run-id'
* OpenRouterService.chat_completion  -> canned response
* delivery.fan_out         -> ['chat']
"""
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

from bson import ObjectId

import pytest


def _make_routine(action_kind='chat'):
    rid = ObjectId()
    uid = ObjectId()
    return {
        '_id': rid,
        'user_id': uid,
        'name': 'Daily Brief',
        'enabled': True,
        'schedule': {'kind': 'cron', 'cron_expr': '0 9 * * *', 'timezone': 'UTC'},
        'action': {
            'kind': action_kind,
            'prompt': 'Give me 3 bullets',
            'config_id': 'quick:openai/gpt-test',
        },
        'outputs': {
            'chat': {'enabled': True, 'conversation_id': None},
            'knowledge': {'enabled': False, 'folder_id': None},
            'telegram': {'enabled': False},
        },
    }


@pytest.mark.asyncio
async def test_chat_action_writes_run_and_calls_fan_out(fake_app_models):
    routine = _make_routine()
    fake_app_models['RoutineModel'].find_by_id.return_value = routine
    fake_app_models['RoutineRunModel'].start.return_value = 'run-id-1'
    fake_app_models['UserModel'].find_by_id.return_value = {'_id': routine['user_id']}
    fake_app_models['UserModel'].get_ai_preferences.return_value = {'enabled': False}
    fake_app_models['OpenRouterService'].chat_completion.return_value = {
        'choices': [{'message': {'content': '- a\n- b\n- c'}}],
        'usage': {'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
    }

    # Now import executor (after stubs are in place)
    from scheduler import executor

    with patch.object(executor.delivery_mod, 'fan_out', new=MagicMock()) as mock_fan:
        async def _fan_out(*args, **kwargs):
            return ['chat']
        mock_fan.side_effect = _fan_out

        run_id = await executor.run_routine(str(routine['_id']))

    assert run_id == 'run-id-1'

    # Verify routine_run lifecycle
    fake_app_models['RoutineRunModel'].start.assert_called_once_with(
        str(routine['_id']), str(routine['user_id'])
    )
    fake_app_models['RoutineRunModel'].complete.assert_called_once()
    complete_kwargs = fake_app_models['RoutineRunModel'].complete.call_args.kwargs
    assert complete_kwargs['status'] == 'success'
    assert complete_kwargs['result_text'] == '- a\n- b\n- c'
    assert complete_kwargs['delivered_to'] == ['chat']
    assert complete_kwargs['result_meta']['model'] == 'openai/gpt-test'

    # Routine record_run called with success
    fake_app_models['RoutineModel'].record_run.assert_called_once()
    args, kwargs = fake_app_models['RoutineModel'].record_run.call_args
    assert kwargs.get('status', args[1] if len(args) > 1 else None) == 'success' or args[1] == 'success'

    # purge_to_50 invoked
    fake_app_models['RoutineRunModel'].purge_to_50.assert_called_once()


@pytest.mark.asyncio
async def test_skip_when_overlap(fake_app_models):
    routine = _make_routine()
    fake_app_models['RoutineModel'].find_by_id.return_value = routine
    # start() returns None => already running
    fake_app_models['RoutineRunModel'].start.return_value = None

    from scheduler import executor

    result = await executor.run_routine(str(routine['_id']))

    assert result is None
    # No completion / fan-out happened
    fake_app_models['RoutineRunModel'].complete.assert_not_called()

    # record_run called with status='skipped'
    fake_app_models['RoutineModel'].record_run.assert_called_once()
    call = fake_app_models['RoutineModel'].record_run.call_args
    # supports kwargs or positional
    status_arg = call.kwargs.get('status') if 'status' in call.kwargs else call.args[1]
    assert status_arg == 'skipped'


@pytest.mark.asyncio
async def test_chat_action_propagates_openrouter_error(fake_app_models):
    routine = _make_routine()
    fake_app_models['RoutineModel'].find_by_id.return_value = routine
    fake_app_models['RoutineRunModel'].start.return_value = 'run-id-2'
    fake_app_models['UserModel'].find_by_id.return_value = {'_id': routine['user_id']}
    fake_app_models['UserModel'].get_ai_preferences.return_value = {}
    fake_app_models['OpenRouterService'].chat_completion.return_value = {
        'error': {'message': '404 Not Found', 'code': 404},
    }

    from scheduler import executor

    with pytest.raises(RuntimeError):
        await executor.run_routine(str(routine['_id']))

    fake_app_models['RoutineRunModel'].fail.assert_called_once()
