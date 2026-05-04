"""
Automate Agent Stream Route

SSE endpoint that creates a browser-use session, polls for messages,
and re-emits them to the client in real time.
"""

import os
import re
import time
import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

from flask import Blueprint, request, Response, jsonify, stream_with_context, current_app
from flask_jwt_extended import jwt_required, get_current_user
from app.models.automate_task import AutomateTaskModel
from app.models.automate_message import AutomateMessageModel
from app.services.browser_use_service import BrowserUseService
from app.utils.network import is_internal_host

logger = logging.getLogger(__name__)

automate_agent_stream_bp = Blueprint("automate_agent_stream", __name__)

_TERMINAL = {"completed", "error", "stopped", "timed_out"}
_MAX_WALLCLOCK_SECONDS = 1800   # 30 minutes hard cap
_POLL_INTERVAL = 2              # seconds between polls
_KEEPALIVE_INTERVAL = 15        # seconds between keepalive pings

# Configurable limits
_MAX_CONCURRENT = int(os.environ.get('AUTOMATE_MAX_CONCURRENT', 1))
_DAILY_QUOTA = int(os.environ.get('AUTOMATE_DAILY_QUOTA', 20))

# Regex to extract URLs from task text
_URL_RE = re.compile(r'https?://[^\s\'"<>]+', re.IGNORECASE)


def _check_task_urls(task_text: str) -> tuple[bool, str]:
    """Return (ok, host) — ok=False if any URL in task resolves to an internal host."""
    for m in _URL_RE.finditer(task_text):
        parsed = urlparse(m.group(0))
        host = parsed.hostname or ''
        if is_internal_host(host):
            return False, host
    return True, ''


def sse_event(event_type: str, data: dict) -> str:
    """Format a dict as an SSE named event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@automate_agent_stream_bp.route("/tasks/run", methods=["POST"])
@jwt_required()
def run_task():
    """
    Create a browser-use session and stream events to the client.

    Body:
        task  (str, required)
        model (str, optional — default claude-sonnet-4.6)

    Events:
        task_started    {task_id, session_id, live_url, model}
        message         {cursor_id, role, type, summary, screenshot_url}
        status_change   {status}
        task_complete   {output, total_messages, duration_ms}
        error           {message, code}
    """
    # Pre-fetch all request-context data BEFORE entering the generator
    # (avoids "Working outside of application context" with eventlet).
    user = get_current_user()
    user_id = str(user["_id"])
    data = request.get_json(silent=True) or {}

    task_text = (data.get("task") or "").strip()
    if not task_text:
        return jsonify({"error": "task is required"}), 400

    model = (data.get("model") or "claude-sonnet-4.6").strip()

    # --- Task URL validation (SSRF guard) ---
    url_ok, blocked_host = _check_task_urls(task_text)
    if not url_ok:
        return jsonify({"error": "task_url_blocked", "host": blocked_host}), 400

    # --- Per-user concurrent cap ---
    concurrent = AutomateTaskModel._get_collection().count_documents({
        "user_id": user["_id"],
        "status": {"$in": ["pending", "running"]},
    })
    if concurrent >= _MAX_CONCURRENT:
        return jsonify({"error": "concurrent_limit"}), 429

    # --- Per-user daily quota ---
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_count = AutomateTaskModel._get_collection().count_documents({
        "user_id": user["_id"],
        "created_at": {"$gte": today_start},
    })
    if daily_count >= _DAILY_QUOTA:
        return jsonify({"error": "daily_quota_exhausted"}), 429

    # Capture app object so generator can push app context
    app = current_app._get_current_object()

    def generate():
        start_time = time.time()
        last_keepalive = start_time
        task_id = None

        try:
            # 1. Persist pending task record
            with app.app_context():
                task_id = AutomateTaskModel.create(user_id, task_text, model)

            # 2. Create cloud session
            try:
                with app.app_context():
                    session = BrowserUseService.create_session(task_text, model)
            except Exception as e:
                with app.app_context():
                    AutomateTaskModel.set_status(task_id, "error", error=str(e))
                yield sse_event("error", {"message": str(e), "code": "session_create_failed"})
                return

            session_id = session.get("id") or session.get("session_id", "")
            live_url = session.get("live_url")

            # Fallback: live_url sometimes only populated after session enters running state
            if not live_url and session_id:
                try:
                    with app.app_context():
                        refreshed = BrowserUseService.get_session(session_id)
                    live_url = refreshed.get("live_url") or live_url
                except Exception:
                    pass  # best effort

            with app.app_context():
                AutomateTaskModel.set_session(task_id, session_id, live_url)
                AutomateTaskModel.set_status(task_id, "running")

            yield sse_event("task_started", {
                "task_id": task_id,
                "session_id": session_id,
                "live_url": live_url,
                "model": model,
            })

            # 3. Polling loop
            last_cursor = None
            last_known_status = "running"

            while True:
                elapsed = time.time() - start_time

                # Hard time cap
                if elapsed > _MAX_WALLCLOCK_SECONDS:
                    with app.app_context():
                        AutomateTaskModel.set_status(task_id, "timed_out")
                    yield sse_event("error", {
                        "message": "Task timed out after 30 minutes",
                        "code": "timeout",
                    })
                    break

                # Keepalive ping (raw SSE comment — proxies won't drop idle connection)
                if time.time() - last_keepalive >= _KEEPALIVE_INTERVAL:
                    yield ":keepalive\n\n"
                    last_keepalive = time.time()

                # Fetch new messages since last cursor
                try:
                    with app.app_context():
                        messages_resp = BrowserUseService.list_messages(
                            session_id, after=last_cursor
                        )
                except Exception as e:
                    logger.warning("list_messages error (will retry): %s", e)
                    time.sleep(_POLL_INTERVAL)
                    continue

                messages = messages_resp.get("messages") or []
                for msg in messages:
                    cursor_id = msg.get("id") or msg.get("cursor_id", "")
                    role = msg.get("role", "")
                    msg_type = msg.get("type", "")
                    summary = msg.get("summary")
                    screenshot_url = msg.get("screenshot_url")
                    msg_data = msg.get("data")

                    with app.app_context():
                        AutomateMessageModel.create(
                            task_id=task_id,
                            cursor_id=cursor_id,
                            role=role,
                            type=msg_type,
                            summary=summary,
                            data=msg_data,
                            screenshot_url=screenshot_url,
                        )
                        AutomateTaskModel.increment_message_count(task_id)

                    yield sse_event("message", {
                        "cursor_id": cursor_id,
                        "role": role,
                        "type": msg_type,
                        "summary": summary,
                        "screenshot_url": screenshot_url,
                    })

                    last_cursor = cursor_id

                # Poll session status
                try:
                    with app.app_context():
                        session_state = BrowserUseService.get_session(session_id)
                except Exception as e:
                    logger.warning("get_session error (will retry): %s", e)
                    time.sleep(_POLL_INTERVAL)
                    continue

                current_status = session_state.get("status", "")

                if current_status and current_status != last_known_status:
                    last_known_status = current_status
                    yield sse_event("status_change", {"status": current_status})

                if current_status in _TERMINAL:
                    output = session_state.get("output")
                    duration_ms = int((time.time() - start_time) * 1000)

                    with app.app_context():
                        task = AutomateTaskModel.find_by_id(task_id)
                        total_messages = (task or {}).get("message_count", 0)
                        AutomateTaskModel.set_status(
                            task_id, current_status, output=output
                        )

                    yield sse_event("task_complete", {
                        "output": output,
                        "total_messages": total_messages,
                        "duration_ms": duration_ms,
                    })
                    break

                time.sleep(_POLL_INTERVAL)

        except Exception as e:
            logger.exception("Unexpected error in automate stream for task %s", task_id)
            if task_id:
                try:
                    with app.app_context():
                        AutomateTaskModel.set_status(task_id, "error", error=str(e))
                except Exception:
                    pass
            yield sse_event("error", {"message": str(e), "code": "unexpected_error"})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
