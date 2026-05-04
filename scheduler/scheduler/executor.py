"""Routine executor — runs when APScheduler fires a job.

`run_routine(routine_id_str)` is the *only* APScheduler-callable entry point.
APScheduler's MongoDBJobStore needs to pickle / serialize the callable's import
path, so `run_routine` lives at module scope and accepts a string id only.
"""
import asyncio
import logging
import traceback
from datetime import datetime, timezone
from typing import Optional

from scheduler.flask_ctx import flask_app
from scheduler import delivery as delivery_mod

logger = logging.getLogger('unichat-scheduler.executor')


# ---------------------------------------------------------------------------
# Action handlers
# ---------------------------------------------------------------------------

def _run_chat(routine: dict, user_doc: dict) -> tuple[str, dict]:
    """Synchronous chat-prompt action. Returns (result_text, result_meta).

    Must be called inside `flask_app.app_context()`.

    If the routine has a project_id, we verify the user still has viewer access
    to that project before resolving the config. The config resolver then uses
    that project_id so project-scoped LLMConfigs are visible.
    """
    from app.services.openrouter_service import OpenRouterService
    from app.utils.config_resolver import resolve_config
    from app.utils.permissions import check_project_access
    from app.models.user import UserModel

    action = routine.get('action') or {}
    prompt = action.get('prompt') or ''
    config_id = action.get('config_id') or ''
    routine_user_id = str(routine['user_id'])

    # Determine the project scope for this routine
    raw_pid = routine.get('project_id')
    routine_project_id = str(raw_pid) if raw_pid else None

    # Pre-flight: if the routine is project-scoped, verify user still has access
    if routine_project_id:
        if not check_project_access(routine_user_id, routine_project_id, 'viewer'):
            raise RuntimeError('project_access_revoked')

    cfg = resolve_config(config_id, user_id=routine_user_id, project_id=routine_project_id)
    if not cfg:
        raise ValueError(f"config not found: {config_id!r}")

    model_id = cfg.get('model_id')
    base_system = cfg.get('system_prompt') or ''
    params = cfg.get('parameters') or {}

    ai_prefs = UserModel.get_ai_preferences(routine['user_id']) or {}
    system_prompt = OpenRouterService.build_enhanced_system_prompt(base_system, ai_prefs)

    messages = [{'role': 'user', 'content': prompt}]

    response = OpenRouterService.chat_completion(
        messages=messages,
        model=model_id,
        system_prompt=system_prompt or None,
        temperature=params.get('temperature', 0.7),
        max_tokens=params.get('max_tokens', 2048),
        stream=False,
        user_id=str(routine['user_id']),
        conversation_id=None,
        feature='routine',
    )

    if not response or 'error' in response:
        err = (response or {}).get('error') or {}
        raise RuntimeError(f"OpenRouter error: {err.get('message') or err}")

    choices = response.get('choices') or []
    if not choices:
        raise RuntimeError('OpenRouter returned no choices')
    text = (choices[0].get('message') or {}).get('content') or ''
    usage = response.get('usage') or {}

    meta = {
        'model': model_id,
        'tokens': {
            'prompt': usage.get('prompt_tokens', 0),
            'completion': usage.get('completion_tokens', 0),
            'total': usage.get('total_tokens', 0),
        },
        'cost': usage.get('total_cost'),
    }
    return text, meta


def _run_workflow(routine: dict) -> tuple[str, dict]:
    """Synchronous workflow action. Returns (result_text, result_meta).

    Must be called inside `flask_app.app_context()`.

    If the routine has a project_id, the user must still have viewer access to
    that project. If the target workflow is itself project-scoped, the routine
    must carry a matching project_id and the user must have project access.
    """
    from app.services.workflow_service import WorkflowService
    from app.models.workflow import WorkflowModel
    from app.utils.permissions import check_project_access

    action = routine.get('action') or {}
    workflow_id = action.get('workflow_id')
    if not workflow_id:
        raise ValueError('routine.action.workflow_id is required for workflow action')

    user_id = str(routine['user_id'])

    # Determine the project scope for this routine
    raw_pid = routine.get('project_id')
    routine_project_id = str(raw_pid) if raw_pid else None

    # Pre-flight: verify user still has access to the routine's project
    if routine_project_id:
        if not check_project_access(user_id, routine_project_id, 'viewer'):
            raise RuntimeError('project_access_revoked')

    # Pre-flight: if the workflow is project-scoped, the routine must carry a
    # matching project_id and the user must have access to that project.
    wf_doc = WorkflowModel.get_by_id(str(workflow_id))
    if wf_doc is not None and wf_doc.get('project_id') is not None:
        wf_project_id = str(wf_doc['project_id'])
        if routine_project_id != wf_project_id:
            raise RuntimeError('project_access_revoked')
        if not check_project_access(user_id, wf_project_id, 'viewer'):
            raise RuntimeError('project_access_revoked')

    result = WorkflowService.execute_workflow(
        workflow_id=str(workflow_id),
        user_id=user_id,
        execution_mode='full',
    )

    status = result.get('status')
    if status != 'completed':
        raise RuntimeError(result.get('error') or f'workflow run finished with status={status}')

    # Best-effort: stitch a brief text summary from the node results, since the
    # delivery channels expect a result_text. Workflow-as-routine v1 simply
    # serializes the textual outputs of every node.
    summary_parts: list[str] = []
    for node_id, node_result in (result.get('node_results') or {}).items():
        output = node_result.get('output')
        if output is None:
            continue
        if isinstance(output, dict):
            text_val = output.get('text') or output.get('content')
            if text_val:
                summary_parts.append(f'[{node_id}] {text_val}')
        elif isinstance(output, str):
            summary_parts.append(f'[{node_id}] {output}')

    text = '\n\n'.join(summary_parts) if summary_parts else f'Workflow run {result.get("run_id")} complete.'
    meta = {
        'model': 'workflow',
        'workflow_id': str(workflow_id),
        'workflow_run_id': result.get('run_id'),
    }
    return text, meta


# ---------------------------------------------------------------------------
# Top-level entry
# ---------------------------------------------------------------------------

async def run_routine(routine_id_str: str) -> Optional[str]:
    """Fire one routine end-to-end.

    Returns the routine_run id on success, None on skip.
    Raises on failure — APScheduler's EVENT_JOB_ERROR listener (retry.py)
    handles retry / failure.
    """
    from app.models.routine import RoutineModel
    from app.models.routine_run import RoutineRunModel

    # Step 1+2: load routine + create routine_run row (with overlap guard)
    with flask_app.app_context():
        routine = RoutineModel.find_by_id(routine_id_str)
        if not routine:
            logger.warning('run_routine: routine %s not found', routine_id_str)
            return None

        user_id = str(routine['user_id'])
        run_id = RoutineRunModel.start(routine_id_str, user_id)
        if run_id is None:
            # Overlap — previous run still in flight
            logger.info('run_routine: skipping %s (already running)', routine_id_str)
            RoutineModel.record_run(
                routine_id_str,
                status='skipped',
                finished_at=datetime.now(timezone.utc),
            )
            return None

        # Pre-fetch user inside the same context to use later in delivery
        from app.models.user import UserModel
        user_doc = UserModel.find_by_id(user_id)

    # Step 3-4: dispatch by action.kind
    action_kind = (routine.get('action') or {}).get('kind') or 'chat'

    try:
        if action_kind == 'chat':
            with flask_app.app_context():
                result_text, result_meta = _run_chat(routine, user_doc)
        elif action_kind == 'workflow':
            with flask_app.app_context():
                result_text, result_meta = _run_workflow(routine)
        else:
            raise ValueError(f'unknown action.kind: {action_kind!r}')
    except Exception as exc:
        # Mark this run as failed-pending-retry; let APScheduler's listener handle retry decision.
        tb = traceback.format_exc()
        with flask_app.app_context():
            RoutineRunModel.fail(run_id, error_msg=str(exc), traceback=tb)
            RoutineModel.record_run(
                routine_id_str,
                status='failed',
                finished_at=datetime.now(timezone.utc),
            )
        # Re-raise so APScheduler dispatches EVENT_JOB_ERROR — retry.py decides what to do next.
        raise

    # Step 5: fan-out delivery (returns the list of channels that succeeded)
    delivered = await delivery_mod.fan_out(routine, run_id, result_text, result_meta)

    # Step 6: mark complete + record on routine
    with flask_app.app_context():
        RoutineRunModel.complete(
            run_id,
            status='success',
            result_text=result_text,
            result_meta=result_meta,
            delivered_to=delivered,
        )
        RoutineModel.record_run(
            routine_id_str,
            status='success',
            finished_at=datetime.now(timezone.utc),
        )

        # Step 7: cap routine_runs to 50
        try:
            RoutineRunModel.purge_to_50(routine_id_str)
        except Exception as exc:
            logger.warning('purge_to_50 failed for %s: %s', routine_id_str, exc)

    logger.info('routine %s ran ok, delivered_to=%s', routine_id_str, delivered)
    return run_id


# ---------------------------------------------------------------------------
# Sync wrapper for APScheduler (it expects a sync callable when the loop is
# already running). We schedule run_routine on the running loop.
# ---------------------------------------------------------------------------

def _run_routine_sync_wrapper(routine_id_str: str) -> None:
    """APScheduler entry point — bridges to the asyncio coroutine.

    APScheduler's AsyncIOScheduler natively awaits coroutines returned from
    job callables, so this wrapper is only used in tests / fallbacks.
    """
    asyncio.run(run_routine(routine_id_str))
