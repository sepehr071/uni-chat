"""
Automate Agent REST Routes

CRUD operations for automate tasks. Streaming handled in automate_agent_stream.py.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.automate_task import AutomateTaskModel
from app.models.automate_message import AutomateMessageModel
from app.services.browser_use_service import BrowserUseService
from app.utils.helpers import serialize_doc

automate_agent_bp = Blueprint("automate_agent", __name__)

# Terminal statuses — no need to call stop on these
_TERMINAL = {"completed", "error", "stopped", "timed_out"}


@automate_agent_bp.route("/tasks", methods=["GET"])
@jwt_required()
def list_tasks():
    user = get_current_user()
    user_id = str(user["_id"])

    limit = request.args.get("limit", 50, type=int)
    skip = request.args.get("skip", 0, type=int)
    limit = min(limit, 100)

    tasks = AutomateTaskModel.find_by_user(user_id, limit=limit, skip=skip)
    total = AutomateTaskModel.count_by_user(user_id)

    return jsonify({
        "tasks": [serialize_doc(t) for t in tasks],
        "total": total,
    })


@automate_agent_bp.route("/tasks/<task_id>", methods=["GET"])
@jwt_required()
def get_task(task_id):
    user = get_current_user()
    user_id = str(user["_id"])

    task = AutomateTaskModel.find_by_id(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if str(task["user_id"]) != user_id:
        return jsonify({"error": "Not authorized"}), 403

    messages = AutomateMessageModel.find_by_task(task_id)

    return jsonify({
        "task": serialize_doc(task),
        "messages": [serialize_doc(m) for m in messages],
    })


@automate_agent_bp.route("/tasks/<task_id>", methods=["DELETE"])
@jwt_required()
def delete_task(task_id):
    user = get_current_user()
    user_id = str(user["_id"])

    task = AutomateTaskModel.find_by_id(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if str(task["user_id"]) != user_id:
        return jsonify({"error": "Not authorized"}), 403

    # Best-effort hard stop before deleting — swallow errors
    session_id = task.get("session_id")
    if session_id and task.get("status") not in _TERMINAL:
        try:
            BrowserUseService.stop_session(session_id, strategy="session")
        except Exception:
            pass

    deleted = AutomateTaskModel.delete(task_id, user_id)
    if deleted:
        return jsonify({"message": "Task deleted"})
    return jsonify({"error": "Failed to delete task"}), 500


@automate_agent_bp.route("/tasks/<task_id>/stop", methods=["POST"])
@jwt_required()
def stop_task(task_id):
    user = get_current_user()
    user_id = str(user["_id"])

    task = AutomateTaskModel.find_by_id(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if str(task["user_id"]) != user_id:
        return jsonify({"error": "Not authorized"}), 403

    if task.get("status") in _TERMINAL:
        return jsonify({"error": "Task already in terminal state"}), 400

    session_id = task.get("session_id")
    if not session_id:
        return jsonify({"error": "No active session for this task"}), 400

    try:
        BrowserUseService.stop_session(session_id, strategy="task")
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    AutomateTaskModel.set_status(task_id, "stopped")

    return jsonify({"ok": True, "status": "stopped"})
