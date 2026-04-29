"""
Routines API blueprint — CRUD + toggle + run-now + run history.

All routes use named sub-paths (never bare '/') per CLAUDE.md known issue.
"""

import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user

from app.models.routine import RoutineModel, MAX_ROUTINES_PER_USER
from app.models.routine_run import RoutineRunModel
from app.utils.decorators import active_user_required
from app.utils.helpers import serialize_doc
from app.utils import scheduler_client
from app.utils.cron_presets import validate_cron

logger = logging.getLogger(__name__)

routines_bp = Blueprint('routines', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_routine(doc: dict) -> dict:
    return serialize_doc(doc)


def _notify(routine_id: str, action: str) -> None:
    """Best-effort scheduler notification — never raises."""
    try:
        scheduler_client.notify(routine_id, action)
    except Exception as exc:
        logger.warning('_notify(%s, %s) error: %s', routine_id, action, exc)


def _validate_routine_body(data: dict) -> list[str]:
    """Return a list of validation error strings (empty = valid)."""
    errors = []

    if not data.get('name') or not isinstance(data['name'], str):
        errors.append('name is required and must be a string')
    elif len(data['name'].strip()) < 1 or len(data['name']) > 200:
        errors.append('name must be 1–200 characters')

    schedule = data.get('schedule')
    if not schedule or not isinstance(schedule, dict):
        errors.append('schedule is required and must be an object')
    else:
        kind = schedule.get('kind')
        if kind not in ('cron', 'one_shot'):
            errors.append("schedule.kind must be 'cron' or 'one_shot'")
        if kind == 'cron':
            cron_expr = schedule.get('cron_expr', '')
            if not cron_expr or not validate_cron(cron_expr):
                errors.append('schedule.cron_expr must be a valid 5-field cron expression')
            if schedule.get('cron_source') not in ('preset', 'natural', 'raw', None):
                errors.append("schedule.cron_source must be 'preset', 'natural', or 'raw'")
        if kind == 'one_shot' and not schedule.get('run_at'):
            errors.append("schedule.run_at is required for one_shot routines")
        if not schedule.get('timezone'):
            errors.append('schedule.timezone is required')

    action = data.get('action')
    if not action or not isinstance(action, dict):
        errors.append('action is required and must be an object')
    else:
        kind = action.get('kind')
        if kind not in ('chat', 'workflow'):
            errors.append("action.kind must be 'chat' or 'workflow'")
        if kind == 'chat':
            if not action.get('prompt'):
                errors.append('action.prompt is required for chat routines')
            if not action.get('config_id'):
                errors.append('action.config_id is required for chat routines')
        if kind == 'workflow':
            if not action.get('workflow_id'):
                errors.append('action.workflow_id is required for workflow routines')

    return errors


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@routines_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
def list_routines():
    user = get_current_user()
    user_id = str(user['_id'])

    skip = request.args.get('skip', 0, type=int)
    limit = min(request.args.get('limit', 50, type=int), 100)

    routines = RoutineModel.find_by_user(user_id, skip=skip, limit=limit)
    return jsonify({'routines': [_serialize_routine(r) for r in routines]}), 200


@routines_bp.route('/create', methods=['POST'])
@jwt_required()
@active_user_required
def create_routine():
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    errors = _validate_routine_body(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    # Enforce per-user limit (admins are exempt)
    if user.get('role') != 'admin':
        active_count = RoutineModel.count_active_for_user(user_id)
        if active_count >= MAX_ROUTINES_PER_USER:
            return jsonify({
                'error': 'Routine limit reached',
                'detail': f'Non-admin users may have at most {MAX_ROUTINES_PER_USER} active routines.',
            }), 400

    # Compute next_run_at for cron routines
    schedule = data['schedule']
    next_run_at = None
    if schedule.get('kind') == 'cron':
        next_run_at = RoutineModel.compute_next_run_at(
            schedule['cron_expr'], schedule.get('timezone', 'UTC')
        )

    data['next_run_at'] = next_run_at

    routine_id = RoutineModel.create(user_id, data)
    routine = RoutineModel.find_by_id(routine_id)

    _notify(routine_id, 'upsert')

    return jsonify({'message': 'Routine created', 'routine': _serialize_routine(routine)}), 201


@routines_bp.route('/<routine_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_routine(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    return jsonify({'routine': _serialize_routine(routine)}), 200


@routines_bp.route('/<routine_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_routine(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    data = request.get_json(silent=True) or {}
    errors = _validate_routine_body(data)
    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    # Recompute next_run_at if schedule changed
    schedule = data.get('schedule', {})
    if schedule.get('kind') == 'cron':
        data['next_run_at'] = RoutineModel.compute_next_run_at(
            schedule['cron_expr'], schedule.get('timezone', 'UTC')
        )

    RoutineModel.update(routine_id, user_id, data)
    updated = RoutineModel.find_by_id(routine_id)

    _notify(routine_id, 'upsert')

    return jsonify({'message': 'Routine updated', 'routine': _serialize_routine(updated)}), 200


@routines_bp.route('/<routine_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_routine(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    deleted = RoutineModel.delete(routine_id, user_id)
    if not deleted:
        return jsonify({'error': 'Failed to delete routine'}), 500

    _notify(routine_id, 'delete')

    return jsonify({'message': 'Routine deleted'}), 200


@routines_bp.route('/<routine_id>/toggle', methods=['POST'])
@jwt_required()
@active_user_required
def toggle_routine(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    new_enabled = not routine.get('enabled', True)

    # Enforce per-user active limit when re-enabling (admins exempt)
    if new_enabled and user.get('role') != 'admin':
        active_count = RoutineModel.count_active_for_user(user_id)
        if active_count >= MAX_ROUTINES_PER_USER:
            return jsonify({
                'error': 'Routine limit reached',
                'detail': f'Non-admin users may have at most {MAX_ROUTINES_PER_USER} active routines.',
            }), 400

    RoutineModel.set_enabled(routine_id, user_id, new_enabled)
    updated = RoutineModel.find_by_id(routine_id)

    _notify(routine_id, 'upsert' if new_enabled else 'delete')

    return jsonify({'message': 'Routine toggled', 'routine': _serialize_routine(updated)}), 200


@routines_bp.route('/<routine_id>/run-now', methods=['POST'])
@jwt_required()
@active_user_required
def run_routine_now(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    scheduler_client.run_now(routine_id)

    return jsonify({'message': 'Run-now request sent to scheduler'}), 202


@routines_bp.route('/<routine_id>/runs', methods=['GET'])
@jwt_required()
@active_user_required
def get_routine_runs(routine_id: str):
    user = get_current_user()
    user_id = str(user['_id'])

    routine = RoutineModel.find_by_id(routine_id)
    if not routine:
        return jsonify({'error': 'Routine not found'}), 404
    if str(routine['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    runs = RoutineRunModel.find_by_routine(routine_id, limit=50)
    return jsonify({'runs': [serialize_doc(r) for r in runs]}), 200
