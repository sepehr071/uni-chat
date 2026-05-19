"""
In-app Helper guide routes.

Endpoints:
    POST   /api/helper/stream                  SSE stream of the helper reply
    POST   /api/helper/cancel/<message_id>     Cancel an in-flight stream
    POST   /api/helper/clear                   Clear the user's helper history
    GET    /api/helper/history                 Return the user's helper history

The model is hard-locked to `google/gemini-3.1-flash-lite` — never read from
the request body. Conversation history is stored separately from chat
conversations in the `helper_conversations` collection (one doc per user).
"""
from __future__ import annotations

import json
import re
import time
from collections import deque
from datetime import datetime
from typing import Optional
from uuid import uuid4

from bson import ObjectId
from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context
from flask_jwt_extended import get_current_user, jwt_required

from app.models.helper_conversation import HelperConversationModel
from app.models.project import ProjectModel
from app.models.workspace import WorkspaceModel
from app.prompts.helper_system import build_helper_system_prompt
from app.services import stream_state
from app.services.dlp_gate import DLPBlockedError, format_blocked_response, gate as dlp_gate
from app.services.openrouter_service import OpenRouterService
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import (
    check_project_access,
    check_workspace_access,
    get_workspace_role,
)

helper_bp = Blueprint('helper', __name__)


# Hard-locked model. Never read from request body — the helper is a fixed
# product surface, not a model picker.
HELPER_MODEL = 'google/gemini-3.1-flash-lite'

# Rolling history window passed to the LLM.
HELPER_HISTORY_WINDOW = 30

# Deep-link extraction — matches `[label](/path)` markdown links and keeps the
# target. We filter to relative (router-internal) paths only.
_MARKDOWN_LINK_RE = re.compile(r'\[[^\]]+\]\(([^)\s]+)\)')


# ---------------------------------------------------------------------------
# Per-user rate limiter — 30 requests / 60 seconds, PER GUNICORN WORKER.
#
# `gunicorn.conf.py` uses `gthread` workers — threads share memory inside the
# worker, NOT across workers. Effective cap is `workers * _RATE_LIMIT_MAX`. A
# coordinated burst could spread across workers; acceptable trade-off vs. a
# Redis/Mongo hit per request. Sweep below caps dict growth.
# ---------------------------------------------------------------------------

_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 30
_helper_rate: dict[str, deque] = {}

# Inactivity sweep — drop empty / very-stale buckets every Nth request so the
# dict size is bounded by the recent-active-user count, not by total unique
# users ever seen.
_SWEEP_EVERY_N = 200
_sweep_counter = 0


def _sweep_inactive_buckets(now: float) -> None:
    cutoff = now - (2 * _RATE_LIMIT_WINDOW)
    stale = [
        uid for uid, dq in _helper_rate.items()
        if not dq or dq[-1] < cutoff
    ]
    for uid in stale:
        _helper_rate.pop(uid, None)


def _check_rate_limit(user_id: str) -> Optional[int]:
    global _sweep_counter
    now = time.monotonic()
    window_start = now - _RATE_LIMIT_WINDOW

    _sweep_counter += 1
    if _sweep_counter >= _SWEEP_EVERY_N:
        _sweep_counter = 0
        _sweep_inactive_buckets(now)

    dq = _helper_rate.setdefault(user_id, deque())
    while dq and dq[0] < window_start:
        dq.popleft()
    if len(dq) >= _RATE_LIMIT_MAX:
        retry_after = int(_RATE_LIMIT_WINDOW - (now - dq[0])) + 1
        return max(retry_after, 1)
    dq.append(now)
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_markdown_links(text: str) -> list[str]:
    """Return relative-path targets from markdown `[label](/path)` links."""
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for match in _MARKDOWN_LINK_RE.finditer(text):
        target = match.group(1).strip()
        if not target.startswith('/'):
            continue
        if target in seen:
            continue
        seen.add(target)
        out.append(target)
    return out


def _sse_event(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


def _strip_ids(messages: list) -> list:
    """Remove ObjectId-only internal fields for the JSON response."""
    out = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        cleaned = {k: v for k, v in m.items() if k != '_id'}
        out.append(cleaned)
    return serialize_doc(out)


def _resolve_workspace(user_id, workspace_id_str: Optional[str]) -> Optional[dict]:
    """Return the workspace doc if the user can read it, else None."""
    if not workspace_id_str or not validate_object_id(workspace_id_str):
        return None
    if not check_workspace_access(user_id, workspace_id_str, 'viewer'):
        return None
    return WorkspaceModel.find_by_id(workspace_id_str)


def _resolve_project(user_id, project_id_str: Optional[str]) -> Optional[dict]:
    """Return the project doc if the user can read it, else None."""
    if not project_id_str or not validate_object_id(project_id_str):
        return None
    if not check_project_access(user_id, project_id_str, 'viewer'):
        return None
    return ProjectModel.find_by_id(project_id_str)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@helper_bp.route('/stream', methods=['POST'])
@jwt_required()
def stream_helper():
    """SSE stream for the in-app helper guide.

    Body schema:
        {
            "message": "<user question>",
            "dlp_confirmed": false,
            "page_context": {
                "route": "/chat",
                "params": { ... },
                "workspace_id": "<oid or null>",
                "project_id": "<oid or null>"
            }
        }
    """
    user = get_current_user()
    user_id = str(user['_id'])

    body = request.get_json(silent=True) or {}
    message_content = (body.get('message') or '').strip()
    if not message_content:
        return jsonify({'error': 'Message content is required'}), 400

    # Rate limit
    retry_after = _check_rate_limit(user_id)
    if retry_after is not None:
        return jsonify({'error': 'rate_limited', 'retry_after': retry_after}), 429

    page_context = body.get('page_context') or {}
    route = (page_context.get('route') or '/').strip() or '/'
    params = page_context.get('params') or {}
    if not isinstance(params, dict):
        params = {}

    workspace_id = page_context.get('workspace_id') or user.get('active_workspace_id')
    workspace_id_str = str(workspace_id) if workspace_id else None
    project_id_str = page_context.get('project_id') or None

    workspace = _resolve_workspace(user['_id'], workspace_id_str)
    project = _resolve_project(user['_id'], project_id_str)
    member_role = (
        get_workspace_role(user['_id'], workspace['_id']) if workspace else None
    )

    # --- DLP pre-flight ---------------------------------------------------
    # The helper is server-side text — scan it through the same gate as
    # chat/arena/debate so policy applies uniformly.
    body_lang = (body.get('lang') or '').strip()
    user_lang = (
        body_lang
        or user.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
        or 'en'
    )[:2].lower()
    try:
        dlp_gate(
            text=message_content,
            user_id=user['_id'],
            workspace_id=workspace['_id'] if workspace else None,
            project_id=project['_id'] if project else None,
            source='helper',
            source_ref={'route': route},
            confirmed=bool(body.get('dlp_confirmed')),
            dlp_confirm_token=body.get('dlp_confirm_token'),
            user_lang=user_lang,
        )
    except DLPBlockedError as dlp_exc:
        status = 403 if dlp_exc.code == 'dlp_blocked' else 409
        return jsonify(format_blocked_response(dlp_exc)), status

    # --- Build prompt + history ------------------------------------------
    system_prompt = build_helper_system_prompt(
        user=user,
        workspace=workspace,
        project=project,
        member_role=member_role,
        route=route,
        params=params,
    )

    history = HelperConversationModel.rolling_window(user_id, n=HELPER_HISTORY_WINDOW)
    formatted_messages = [
        {'role': m['role'], 'content': m['content']}
        for m in history
        if m.get('role') in ('user', 'assistant', 'system') and m.get('content')
    ]
    formatted_messages.append({'role': 'user', 'content': message_content})

    # Persist the user turn before streaming so a mid-stream cancel still
    # leaves the question on the record.
    HelperConversationModel.append_message(
        user_id=user['_id'],
        role='user',
        content=message_content,
        page_context={
            'route': route,
            'params': params,
            'workspace_id': workspace_id_str,
            'project_id': project_id_str,
        },
    )

    message_id = f'helper_msg:{uuid4()}'
    stream_state.register(message_id, user_id=user_id)
    app = current_app._get_current_object()

    def generate():
        full_content = ''
        finish_reason = 'stop'

        # Send opening event so the client can hook up the cancel button.
        yield _sse_event('message_start', {
            'message_id': message_id,
            'route': route,
        })

        try:
            stream = OpenRouterService.chat_completion(
                messages=formatted_messages,
                model=HELPER_MODEL,
                system_prompt=system_prompt,
                temperature=0.4,
                max_tokens=800,
                stream=True,
                user_id=user_id,
                conversation_id=None,
                feature='helper',
                workspace_id=workspace_id_str,
                project_id=project_id_str,
                origin='helper',
            )

            for chunk in stream:
                if stream_state.is_cancelled(message_id):
                    finish_reason = 'cancelled'
                    break

                if 'error' in chunk:
                    error_msg = chunk['error'].get('message', 'Unknown error')
                    yield _sse_event('message_error', {
                        'message_id': message_id,
                        'error': error_msg,
                    })
                    return

                if chunk.get('done'):
                    break

                choices = chunk.get('choices') or []
                if choices:
                    delta = choices[0].get('delta') or {}
                    content = delta.get('content') or ''
                    if content:
                        full_content += content
                        yield _sse_event('message_chunk', {
                            'message_id': message_id,
                            'content': content,
                        })
                    if choices[0].get('finish_reason'):
                        finish_reason = choices[0]['finish_reason']

        except Exception as e:  # pragma: no cover - defensive
            app.logger.exception('helper stream failed: %s', e)
            yield _sse_event('message_error', {
                'message_id': message_id,
                'error': str(e),
            })
            return
        finally:
            stream_state.clear(message_id)

        # Persist the assistant turn with extracted deep links.
        deep_links = extract_markdown_links(full_content)
        try:
            HelperConversationModel.append_message(
                user_id=user['_id'],
                role='assistant',
                content=full_content,
                page_context={
                    'route': route,
                    'params': params,
                },
                deep_links=deep_links,
            )
        except Exception as e:  # pragma: no cover - persistence best-effort
            app.logger.warning('helper history persist failed: %s', e)

        yield _sse_event('message_complete', {
            'message_id': message_id,
            'content': full_content,
            'deep_links': deep_links,
            'finish_reason': finish_reason,
        })

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        },
    )


@helper_bp.route('/cancel/<message_id>', methods=['POST'])
@jwt_required()
def cancel_helper(message_id):
    """Cancel an in-flight helper stream owned by this user."""
    user = get_current_user()
    user_id = str(user['_id'])

    owner = stream_state.owner_of(message_id)
    if owner is None:
        return jsonify({'error': 'Generation not found'}), 404
    if owner != user_id:
        return jsonify({'error': 'Not authorized'}), 403
    stream_state.mark_cancelled(message_id)
    return jsonify({'success': True, 'message': 'Generation cancelled'})


@helper_bp.route('/clear', methods=['POST'])
@jwt_required()
def clear_helper():
    """Clear this user's helper conversation history."""
    user = get_current_user()
    HelperConversationModel.clear(user['_id'])
    return jsonify({'ok': True}), 200


@helper_bp.route('/history', methods=['GET'])
@jwt_required()
def get_helper_history():
    """Return this user's helper conversation history (oldest -> newest)."""
    user = get_current_user()
    history = HelperConversationModel.get_history(user['_id'])
    return jsonify({'messages': _strip_ids(history)}), 200
