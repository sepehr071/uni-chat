"""
Natural-language schedule parser for Routines.

POST /api/routines/parse-schedule
Body: { text: str, timezone: str }
Response: { cron_expr: str, preview: [iso8601 x5], label: str | null }
"""

import json
import logging
import re
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.utils.decorators import active_user_required
from app.utils.cron_presets import validate_cron, cron_to_label


def _resolve_attribution(user_id, data):
    """Resolve workspace_id/project_id for NL routine parsing.

    Prefers the request body (when the caller is editing an existing routine and
    passes its scope), then falls back to the user's active workspace. Either may
    be None for personal-scope users.
    """
    body_ws = data.get('workspace_id')
    body_proj = data.get('project_id')
    user_doc = UserModel.find_by_id(user_id) or {}
    ws_id = body_ws or user_doc.get('active_workspace_id')
    proj_id = body_proj
    return (
        str(ws_id) if ws_id else None,
        str(proj_id) if proj_id else None,
    )

logger = logging.getLogger(__name__)

routines_nl_bp = Blueprint('routines_nl', __name__)

_NL_MODEL = 'google/gemini-2.5-flash-lite'

_SYSTEM_PROMPT = (
    "Convert natural-language schedule descriptions to a 5-field cron expression. "
    "Return ONLY the cron expression, nothing else. "
    "Examples: "
    "'every weekday at 9am' -> '0 9 * * 1-5', "
    "'every 5 minutes' -> '*/5 * * * *', "
    "'monthly on the 1st at midnight' -> '0 0 1 * *'."
)


def _compute_next_n(cron_expr: str, tz_str: str, n: int = 5) -> list[str]:
    """Return the next N fire times as UTC ISO-8601 strings."""
    from croniter import croniter
    import zoneinfo

    tz = zoneinfo.ZoneInfo(tz_str)
    now_local = datetime.now(tz)
    cron = croniter(cron_expr, now_local)
    results = []
    for _ in range(n):
        next_dt = cron.get_next(datetime)
        if next_dt.tzinfo is None:
            next_dt = next_dt.replace(tzinfo=tz)
        results.append(next_dt.astimezone(timezone.utc).isoformat())
    return results


@routines_nl_bp.route('/parse-schedule', methods=['POST'])
@jwt_required()
@active_user_required
def parse_schedule():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    text = (data.get('text') or '').strip()
    tz_str = (data.get('timezone') or 'UTC').strip()

    if not text:
        return jsonify({'error': 'text is required'}), 400

    # Validate timezone
    try:
        import zoneinfo
        zoneinfo.ZoneInfo(tz_str)
    except Exception:
        return jsonify({'error': f'Invalid timezone: {tz_str}'}), 400

    ws_id, proj_id = _resolve_attribution(user_id, data)

    # Ask the LLM
    try:
        response = OpenRouterService.chat_completion(
            messages=[{'role': 'user', 'content': text}],
            model=_NL_MODEL,
            system_prompt=_SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=32,
            stream=False,
            user_id=user_id,
            conversation_id=None,
            feature='nl_cron',
            workspace_id=ws_id,
            project_id=proj_id,
            origin='routine',
        )
    except Exception as exc:
        logger.error('NL schedule LLM call failed: %s', exc)
        return jsonify({'error': 'LLM call failed', 'detail': str(exc)}), 502

    if 'error' in response:
        return jsonify({
            'error': 'LLM returned an error',
            'detail': response['error'].get('message', str(response['error'])),
        }), 502

    try:
        raw_cron = (
            response['choices'][0]['message']['content']
            .strip()
            .strip("'\"")
        )
    except (KeyError, IndexError, TypeError) as exc:
        logger.error('Unexpected LLM response shape: %s', response)
        return jsonify({'error': 'Unexpected LLM response', 'detail': str(exc)}), 502

    if not validate_cron(raw_cron):
        return jsonify({
            'error': 'LLM produced an invalid cron expression',
            'raw_output': raw_cron,
        }), 400

    # Compute next 5 fires
    try:
        preview = _compute_next_n(raw_cron, tz_str, n=5)
    except Exception as exc:
        logger.error('preview compute failed: %s', exc)
        return jsonify({'error': 'Failed to compute next fire times', 'detail': str(exc)}), 500

    return jsonify({
        'cron_expr': raw_cron,
        'preview': preview,
        'label': cron_to_label(raw_cron),
    }), 200


_ROUTINE_SYSTEM_PROMPT = (
    "You extract a recurring schedule and an action prompt from a single user request. "
    "Return ONLY a JSON object with exactly two keys: "
    "\"cron_expr\" (a 5-field cron expression) and "
    "\"prompt\" (the action the AI should perform on each fire, rewritten as a clear instruction with NO scheduling words). "
    "Do not wrap the JSON in code fences. Do not add explanation. "
    "Examples:\n"
    "Input: 'every weekday 9am summarize my unread emails' -> "
    "{\"cron_expr\":\"0 9 * * 1-5\",\"prompt\":\"Summarize my unread emails.\"}\n"
    "Input: 'daily at 8pm write a short journal prompt for me' -> "
    "{\"cron_expr\":\"0 20 * * *\",\"prompt\":\"Write a short journal prompt for me.\"}\n"
    "Input: 'every 2 hours give me a tech news brief' -> "
    "{\"cron_expr\":\"0 */2 * * *\",\"prompt\":\"Give me a tech news brief.\"}"
)


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith('```'):
        # ```json ... ``` or ``` ... ```
        text = re.sub(r'^```[a-zA-Z]*\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    return text.strip()


@routines_nl_bp.route('/parse-routine', methods=['POST'])
@jwt_required()
@active_user_required
def parse_routine():
    """
    Single-shot extraction of cron + prompt from one NL message.

    POST /api/routines/parse-routine
    Body: { text: str, timezone: str }
    Response: { cron_expr, prompt, preview: [iso8601 x5], label }
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    tz_str = (data.get('timezone') or 'UTC').strip()

    if not text:
        return jsonify({'error': 'text is required'}), 400

    try:
        import zoneinfo
        zoneinfo.ZoneInfo(tz_str)
    except Exception:
        return jsonify({'error': f'Invalid timezone: {tz_str}'}), 400

    ws_id, proj_id = _resolve_attribution(user_id, data)

    try:
        response = OpenRouterService.chat_completion(
            messages=[{'role': 'user', 'content': text}],
            model=_NL_MODEL,
            system_prompt=_ROUTINE_SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=200,
            stream=False,
            user_id=user_id,
            conversation_id=None,
            feature='nl_cron',
            workspace_id=ws_id,
            project_id=proj_id,
            origin='routine',
        )
    except Exception as exc:
        logger.error('NL routine LLM call failed: %s', exc)
        return jsonify({'error': 'LLM call failed', 'detail': str(exc)}), 502

    if 'error' in response:
        return jsonify({
            'error': 'LLM returned an error',
            'detail': response['error'].get('message', str(response['error'])),
        }), 502

    try:
        raw = response['choices'][0]['message']['content']
    except (KeyError, IndexError, TypeError) as exc:
        logger.error('Unexpected LLM response shape: %s', response)
        return jsonify({'error': 'Unexpected LLM response', 'detail': str(exc)}), 502

    cleaned = _strip_code_fences(raw)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to locate the first {...} block
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if not match:
            return jsonify({'error': 'LLM did not return JSON', 'raw_output': raw}), 400
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            return jsonify({'error': 'LLM JSON parse failed', 'detail': str(exc), 'raw_output': raw}), 400

    cron_expr = (parsed.get('cron_expr') or '').strip().strip("'\"")
    prompt = (parsed.get('prompt') or '').strip()

    if not validate_cron(cron_expr):
        return jsonify({'error': 'LLM produced an invalid cron expression', 'raw_output': raw}), 400
    if not prompt:
        return jsonify({'error': 'LLM did not return a prompt', 'raw_output': raw}), 400

    try:
        preview = _compute_next_n(cron_expr, tz_str, n=5)
    except Exception as exc:
        logger.error('preview compute failed: %s', exc)
        return jsonify({'error': 'Failed to compute next fire times', 'detail': str(exc)}), 500

    return jsonify({
        'cron_expr': cron_expr,
        'prompt': prompt,
        'preview': preview,
        'label': cron_to_label(cron_expr),
    }), 200
