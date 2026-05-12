"""
Routines API blueprint — CRUD + toggle + run-now + run history.

All routes use named sub-paths (never bare '/') per CLAUDE.md known issue.
"""

import logging
from bson import ObjectId
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user

from app.models.routine import RoutineModel, MAX_ROUTINES_PER_USER
from app.models.routine_run import RoutineRunModel
from app.utils.decorators import active_user_required
from app.utils.helpers import serialize_doc
from app.utils import scheduler_client
from app.utils.cron_presets import validate_cron
from app.utils.permissions import check_project_access

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

    # Optional project_id — if provided must be a valid 24-char hex ObjectId string
    pid = data.get('project_id')
    if pid is not None and pid != '':
        if not isinstance(pid, str) or not ObjectId.is_valid(pid):
            errors.append('project_id must be a valid 24-character hex ObjectId string')

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

    # project_id query param:
    #   absent              → '__any__' (all routines regardless of project)
    #   '' (empty string)   → '__any__' (CLAUDE.md: never send literal 'null'
    #                         string; empty string is the legal "omit" form)
    #   'null' or '__personal__' → None (personal-scope only — explicit)
    #   '<hex>'             → that specific project (access check required)
    pid_param = request.args.get('project_id')
    if pid_param is None or pid_param == '':
        # P2.42: empty string used to map to "personal only" along with the
        # 'null' / '__personal__' sentinels, which surprised callers that
        # send `?project_id=` to mean "no scope filter". Treat empty the same
        # as absent — callers must use the explicit 'null' sentinel for
        # personal-only.
        filter_project = '__any__'
    elif pid_param in ('null', '__personal__'):
        filter_project = None
    elif ObjectId.is_valid(pid_param):
        if not check_project_access(user_id, pid_param, 'viewer'):
            return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403
        filter_project = pid_param
    else:
        return jsonify({'error': 'project_id must be a valid ObjectId or null/__personal__'}), 400

    routines = RoutineModel.find_by_user_and_project(user_id, filter_project, skip=skip, limit=limit)
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

    # Gate on project access if a project_id was supplied
    pid = data.get('project_id')
    if pid and isinstance(pid, str) and ObjectId.is_valid(pid):
        if not check_project_access(user_id, pid, 'viewer'):
            return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403

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

    # If project_id is being changed, revalidate access on the new project.
    # Clearing project_id (None / empty) is always allowed.
    if 'project_id' in data:
        new_pid = data.get('project_id')
        existing_pid = str(routine['project_id']) if routine.get('project_id') else None
        # Normalise incoming value for comparison
        norm_new_pid = new_pid if (new_pid and isinstance(new_pid, str)) else None
        if norm_new_pid != existing_pid:
            if norm_new_pid and ObjectId.is_valid(norm_new_pid):
                if not check_project_access(user_id, norm_new_pid, 'viewer'):
                    return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403

    # P1.16: the 20-routine cap was enforced on create + toggle, but not on
    # PUT. A user could create a routine disabled, then PUT enabled=True and
    # bypass the limit entirely. Re-check when this PUT flips enabled
    # False → True (admins are exempt per the existing policy).
    was_enabled = bool(routine.get('enabled', True))
    new_enabled_raw = data.get('enabled', was_enabled)
    new_enabled = bool(new_enabled_raw)
    if (not was_enabled) and new_enabled and user.get('role') != 'admin':
        active_count = RoutineModel.count_active_for_user(user_id)
        if active_count >= MAX_ROUTINES_PER_USER:
            return jsonify({
                'error': 'Routine limit reached',
                'detail': f'Non-admin users may have at most {MAX_ROUTINES_PER_USER} active routines.',
            }), 400

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
