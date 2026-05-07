"""
DLP routes — pre-send scan, workspace policy management, event log, admin endpoints.

URL prefix is /api (registered in app/__init__.py).

Endpoint map:
    POST   /api/dlp/scan
    GET    /api/workspaces/<wid>/dlp/policy
    PUT    /api/workspaces/<wid>/dlp/policy
    GET    /api/workspaces/<wid>/dlp/events
    GET    /api/workspaces/<wid>/dlp/events/<event_id>
    PATCH  /api/workspaces/<wid>/dlp/events/<event_id>
    GET    /api/workspaces/<wid>/dlp/stats
    GET    /api/admin/dlp/events
    GET    /api/admin/dlp/events/<event_id>
    GET    /api/admin/dlp/stats
"""
from __future__ import annotations

import re
import uuid
from collections import deque
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user

from app.models.dlp_event import DLPEventModel, VALID_STATUSES
from app.models.workspace import WorkspaceModel
from app.services.dlp_rules import BUILTIN_RULES
from app.services.dlp_service import DLPDetector, effective_policy
from app.utils.decorators import active_user_required, admin_required, workspace_member
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import check_workspace_access

dlp_bp = Blueprint('dlp', __name__)

# ---------------------------------------------------------------------------
# Per-user rate limiter for /dlp/scan
# 60 calls per 60-second rolling window, in-memory (shared across eventlet workers)
# ---------------------------------------------------------------------------

_RATE_LIMIT_WINDOW = 60        # seconds
_RATE_LIMIT_MAX = 60           # max calls per window
_scan_rate: dict[str, deque] = {}  # user_id -> deque of timestamps


def _check_rate_limit(user_id: str) -> Optional[int]:
    """Return retry_after seconds if rate-limited, else None."""
    now = datetime.utcnow().timestamp()
    window_start = now - _RATE_LIMIT_WINDOW

    dq = _scan_rate.setdefault(user_id, deque())
    # Drop entries outside the window
    while dq and dq[0] < window_start:
        dq.popleft()

    if len(dq) >= _RATE_LIMIT_MAX:
        oldest = dq[0]
        retry_after = int(_RATE_LIMIT_WINDOW - (now - oldest)) + 1
        return retry_after

    dq.append(now)
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rule_catalog() -> list[dict]:
    """Return the static rule catalog in API-safe shape (no compiled regex)."""
    return [
        {
            'id': r['id'],
            'name': r['name'],
            'severity': r['severity'],
            'default_action': r['default_action'],
            'category': r['category'],
        }
        for r in BUILTIN_RULES
    ]


_ALLOWED_POLICY_KEYS = {
    'enabled',
    'sensitivity',
    'rule_overrides',
    'custom_patterns',
    'internal_hostname_suffixes',
    'llm_classifier',
    'notify_owners',
}

_VALID_SEVERITIES = {'low', 'medium', 'high', 'critical'}
_VALID_ACTIONS = {'warn', 'require_confirm', 'block'}
_VALID_SENSITIVITIES = {'lenient', 'balanced', 'strict'}


def _validate_custom_pattern(pat: Any, idx: int) -> Optional[str]:
    """Return an error string if the pattern is invalid, else None."""
    if not isinstance(pat, dict):
        return f"custom_patterns[{idx}] must be an object"
    name = pat.get('name', '')
    if not name or not str(name).strip():
        return f"custom_patterns[{idx}].name must be a non-empty string"
    regex_str = pat.get('regex', '')
    if not regex_str:
        return f"custom_patterns[{idx}].regex must be a non-empty string"
    try:
        re.compile(regex_str)
    except re.error as exc:
        return f"custom_patterns[{idx}].regex is invalid: {exc}"
    severity = pat.get('severity', '')
    if severity not in _VALID_SEVERITIES:
        return f"custom_patterns[{idx}].severity must be one of {sorted(_VALID_SEVERITIES)}"
    action = pat.get('action', '')
    if action not in _VALID_ACTIONS:
        return f"custom_patterns[{idx}].action must be one of {sorted(_VALID_ACTIONS)}"
    return None


_VALID_LLM_PROVIDERS = ('google/', 'anthropic/', 'openai/', 'x-ai/')
_VALID_CONFIDENTIAL_ACTIONS = {'warn', 'require_confirm'}
_VALID_RESTRICTED_ACTIONS = {'warn', 'require_confirm', 'block'}


def _validate_llm_classifier(lc: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(lc, dict):
        return None, "llm_classifier must be an object"
    clean: dict = {}
    if 'enabled' in lc:
        clean['enabled'] = bool(lc['enabled'])
    if 'model' in lc:
        m = str(lc['model'] or '').strip()
        if m and not any(m.startswith(p) for p in _VALID_LLM_PROVIDERS):
            return None, f"llm_classifier.model must start with one of {list(_VALID_LLM_PROVIDERS)}"
        clean['model'] = m or 'google/gemini-3.1-flash-lite-preview'
    if 'guidance_prompt' in lc:
        gp = str(lc['guidance_prompt'] or '')
        if len(gp) > 4000:
            return None, "llm_classifier.guidance_prompt must be 4000 characters or less"
        clean['guidance_prompt'] = gp
    if 'action_thresholds' in lc:
        at = lc['action_thresholds']
        if not isinstance(at, dict):
            return None, "llm_classifier.action_thresholds must be an object"
        clean_at: dict = {}
        if 'confidential' in at:
            v = at['confidential']
            if v not in _VALID_CONFIDENTIAL_ACTIONS:
                return None, f"llm_classifier.action_thresholds.confidential must be one of {sorted(_VALID_CONFIDENTIAL_ACTIONS)}"
            clean_at['confidential'] = v
        if 'restricted' in at:
            v = at['restricted']
            if v not in _VALID_RESTRICTED_ACTIONS:
                return None, f"llm_classifier.action_thresholds.restricted must be one of {sorted(_VALID_RESTRICTED_ACTIONS)}"
            clean_at['restricted'] = v
        clean['action_thresholds'] = clean_at
    return clean, None


def _build_policy_payload(body: dict) -> tuple[Optional[dict], Optional[str]]:
    """
    Validate and normalise the PUT /dlp/policy request body.
    Returns (clean_payload, error_str). One of them is always None.
    """
    unknown = set(body.keys()) - _ALLOWED_POLICY_KEYS
    if unknown:
        return None, f"Unknown policy key(s): {sorted(unknown)}"

    clean: dict = {}

    if 'enabled' in body:
        clean['enabled'] = bool(body['enabled'])

    if 'sensitivity' in body:
        sens = body['sensitivity']
        if sens not in _VALID_SENSITIVITIES:
            return None, f"sensitivity must be one of {sorted(_VALID_SENSITIVITIES)}"
        clean['sensitivity'] = sens

    if 'rule_overrides' in body:
        ro = body['rule_overrides']
        if not isinstance(ro, dict):
            return None, "rule_overrides must be an object"
        valid_actions_with_allow = {'allow', 'warn', 'require_confirm', 'block'}
        for rule_id, action in ro.items():
            if action not in valid_actions_with_allow:
                return None, f"rule_overrides[{rule_id!r}] must be one of {sorted(valid_actions_with_allow)}"
        clean['rule_overrides'] = ro

    if 'custom_patterns' in body:
        patterns = body['custom_patterns']
        if not isinstance(patterns, list):
            return None, "custom_patterns must be an array"
        normalised = []
        for i, pat in enumerate(patterns):
            err = _validate_custom_pattern(pat, i)
            if err:
                return None, err
            entry = {
                'id': str(pat.get('id') or uuid.uuid4().hex[:12]),
                'name': str(pat['name']).strip(),
                'regex': str(pat['regex']),
                'severity': pat['severity'],
                'action': pat['action'],
            }
            normalised.append(entry)
        clean['custom_patterns'] = normalised

    if 'internal_hostname_suffixes' in body:
        suffixes = body['internal_hostname_suffixes']
        if not isinstance(suffixes, list):
            return None, "internal_hostname_suffixes must be an array"
        clean['internal_hostname_suffixes'] = [str(s).strip() for s in suffixes if s]

    if 'llm_classifier' in body:
        lc_clean, lc_err = _validate_llm_classifier(body['llm_classifier'])
        if lc_err:
            return None, lc_err
        clean['llm_classifier'] = lc_clean

    if 'notify_owners' in body:
        clean['notify_owners'] = bool(body['notify_owners'])

    return clean, None


# ---------------------------------------------------------------------------
# Pre-send scan
# ---------------------------------------------------------------------------

@dlp_bp.route('/dlp/scan', methods=['POST'])
@active_user_required
def dlp_scan():
    """
    Pre-send DLP scan.

    Writes a dlp_event when highest_action is block / require_confirm so the
    manager dashboard sees attempts even when the client modal aborts the send.
    Warn-level matches are NOT logged here (the chokepoint logs them when the
    user actually sends).

    Body: { text: str, workspace_id: str, project_id?: str, source: str }
    """
    from dataclasses import asdict

    current_user = get_current_user()
    user_id_str = str(current_user['_id'])

    # Rate limit check
    retry_after = _check_rate_limit(user_id_str)
    if retry_after is not None:
        return jsonify({'error': 'rate_limited', 'retry_after': retry_after}), 429

    body = request.get_json(silent=True) or {}
    text = body.get('text', '')
    workspace_id = body.get('workspace_id', '')
    project_id = body.get('project_id') or None
    source = body.get('source', '')

    if not text:
        return jsonify({'error': 'text is required'}), 400
    if not workspace_id:
        return jsonify({'error': 'workspace_id is required'}), 400
    if not validate_object_id(workspace_id):
        return jsonify({'error': 'Invalid workspace_id'}), 400
    if not source:
        return jsonify({'error': 'source is required'}), 400

    # Verify user has at least viewer access to the workspace
    if not check_workspace_access(current_user['_id'], workspace_id, 'viewer'):
        return jsonify({'error': 'Workspace access denied', 'code': 'forbidden'}), 403

    user_lang = (
        current_user.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
        or 'en'
    )[:2].lower()

    detector = DLPDetector.from_workspace(workspace_id)
    result = detector.scan(text, user_lang=user_lang)

    if result.matches and result.highest_action in ('block', 'require_confirm'):
        try:
            DLPEventModel.create(
                user_id=current_user['_id'],
                workspace_id=workspace_id,
                project_id=project_id,
                source=source or 'chat',
                source_ref={'preflight': True},
                matches=[asdict(m) for m in result.matches],
                highest_action=result.highest_action,
                was_sent=False,
                text_sha256=result.text_sha256,
                text_length=result.text_length,
            )
        except Exception:
            pass  # never let event-write failure break the scan response

    return jsonify({'result': result.to_dict()}), 200


# ---------------------------------------------------------------------------
# Workspace DLP policy
# ---------------------------------------------------------------------------

@dlp_bp.route('/workspaces/<wid>/dlp/policy', methods=['GET'])
@workspace_member('viewer', 'wid')
def get_dlp_policy(wid: str):
    """Return effective DLP policy + rule catalog for a workspace."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    workspace = WorkspaceModel.find_by_id(wid)
    if workspace is None:
        return jsonify({'error': 'Workspace not found'}), 404

    raw_dlp = (workspace.get('settings') or {}).get('dlp')
    policy = effective_policy(raw_dlp)

    return jsonify({
        'policy': policy,
        'rule_catalog': _rule_catalog(),
    }), 200


@dlp_bp.route('/workspaces/<wid>/dlp/policy', methods=['PUT'])
@workspace_member('owner', 'wid')
def update_dlp_policy(wid: str):
    """Update workspace DLP policy. Only workspace owners may call this."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    workspace = WorkspaceModel.find_by_id(wid)
    if workspace is None:
        return jsonify({'error': 'Workspace not found'}), 404

    body = request.get_json(silent=True) or {}
    payload, err = _build_policy_payload(body)
    if err:
        return jsonify({'error': err}), 400

    # Merge with existing settings.dlp
    existing_dlp = (workspace.get('settings') or {}).get('dlp') or {}
    merged_dlp = {**existing_dlp, **payload}

    # Persist
    WorkspaceModel.get_collection().update_one(
        {'_id': ObjectId(wid)},
        {'$set': {'settings.dlp': merged_dlp}},
    )

    return jsonify({'policy': effective_policy(merged_dlp)}), 200


# ---------------------------------------------------------------------------
# Workspace DLP events
# ---------------------------------------------------------------------------

@dlp_bp.route('/workspaces/<wid>/dlp/events', methods=['GET'])
@workspace_member('owner', 'wid')
def list_dlp_events(wid: str):
    """Paginated DLP event list for a workspace. Owner-only."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    user_id_filter = request.args.get('user_id') or None
    if user_id_filter and not validate_object_id(user_id_filter):
        return jsonify({'error': 'Invalid user_id filter'}), 400

    severity = request.args.get('severity') or None
    source = request.args.get('source') or None
    status = request.args.get('status') or None
    action = request.args.get('action') or None
    from_dt = request.args.get('from') or None
    to_dt = request.args.get('to') or None

    try:
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', 50))
    except (TypeError, ValueError):
        return jsonify({'error': 'skip and limit must be integers'}), 400
    limit = max(1, min(200, limit))

    try:
        rows, total = DLPEventModel.find_by_workspace(
            wid,
            user_id=user_id_filter,
            severity=severity,
            source=source,
            status=status,
            action=action,
            from_dt=from_dt,
            to_dt=to_dt,
            skip=skip,
            limit=limit,
        )
    except (ValueError, Exception) as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({
        'rows': serialize_doc(rows),
        'total': total,
        'skip': skip,
        'limit': limit,
    }), 200


@dlp_bp.route('/workspaces/<wid>/dlp/events/<event_id>', methods=['GET'])
@workspace_member('owner', 'wid')
def get_dlp_event(wid: str, event_id: str):
    """Fetch a single DLP event. 404 if it doesn't belong to this workspace."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400
    if not validate_object_id(event_id):
        return jsonify({'error': 'Invalid event ID'}), 400

    event = DLPEventModel.find_by_id(event_id)
    if event is None or str(event.get('workspace_id', '')) != wid:
        return jsonify({'error': 'Event not found', 'code': 'not_found'}), 404

    return jsonify({'event': serialize_doc(event)}), 200


@dlp_bp.route('/workspaces/<wid>/dlp/events/<event_id>', methods=['PATCH'])
@workspace_member('owner', 'wid')
def patch_dlp_event(wid: str, event_id: str):
    """Update status + review_note on a DLP event."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400
    if not validate_object_id(event_id):
        return jsonify({'error': 'Invalid event ID'}), 400

    event = DLPEventModel.find_by_id(event_id)
    if event is None or str(event.get('workspace_id', '')) != wid:
        return jsonify({'error': 'Event not found', 'code': 'not_found'}), 404

    body = request.get_json(silent=True) or {}
    new_status = body.get('status')
    if not new_status:
        return jsonify({'error': 'status is required'}), 400
    if new_status not in VALID_STATUSES:
        return jsonify({'error': f'status must be one of {sorted(VALID_STATUSES)}'}), 400

    review_note = body.get('review_note')

    current_user = get_current_user()
    try:
        updated = DLPEventModel.update_review(
            event_id,
            reviewer_id=current_user['_id'],
            status=new_status,
            review_note=review_note,
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({'event': serialize_doc(updated)}), 200


# ---------------------------------------------------------------------------
# Workspace DLP stats
# ---------------------------------------------------------------------------

@dlp_bp.route('/workspaces/<wid>/dlp/stats', methods=['GET'])
@workspace_member('owner', 'wid')
def get_dlp_stats(wid: str):
    """Aggregated stats for a workspace. Owner-only."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    try:
        days = int(request.args.get('days', 7))
    except (TypeError, ValueError):
        return jsonify({'error': 'days must be an integer'}), 400
    days = max(1, min(365, days))

    stats = DLPEventModel.aggregate_workspace_stats(wid, days=days)
    return jsonify(serialize_doc(stats)), 200


# ---------------------------------------------------------------------------
# Admin endpoints (cross-workspace)
# ---------------------------------------------------------------------------

@dlp_bp.route('/admin/dlp/events', methods=['GET'])
@admin_required
def admin_list_dlp_events():
    """Cross-workspace DLP event list for platform admins."""
    from datetime import timedelta

    workspace_id_filter = request.args.get('workspace_id') or None
    if workspace_id_filter and not validate_object_id(workspace_id_filter):
        return jsonify({'error': 'Invalid workspace_id filter'}), 400

    user_id_filter = request.args.get('user_id') or None
    if user_id_filter and not validate_object_id(user_id_filter):
        return jsonify({'error': 'Invalid user_id filter'}), 400

    severity = request.args.get('severity') or None
    source = request.args.get('source') or None
    status = request.args.get('status') or None
    action = request.args.get('action') or None
    from_dt = request.args.get('from') or None
    to_dt = request.args.get('to') or None

    days_param = request.args.get('days') or None
    if days_param and not from_dt:
        try:
            days_int = max(1, min(365, int(days_param)))
        except (TypeError, ValueError):
            return jsonify({'error': 'days must be an integer'}), 400
        from_dt = (datetime.utcnow() - timedelta(days=days_int)).isoformat()

    try:
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', 50))
    except (TypeError, ValueError):
        return jsonify({'error': 'skip and limit must be integers'}), 400
    limit = max(1, min(200, limit))

    try:
        rows, total = DLPEventModel.find_all(
            workspace_id=workspace_id_filter,
            user_id=user_id_filter,
            severity=severity,
            source=source,
            status=status,
            action=action,
            from_dt=from_dt,
            to_dt=to_dt,
            skip=skip,
            limit=limit,
        )
    except (ValueError, Exception) as exc:
        return jsonify({'error': str(exc)}), 400

    return jsonify({
        'rows': serialize_doc(rows),
        'total': total,
        'skip': skip,
        'limit': limit,
    }), 200


@dlp_bp.route('/admin/dlp/events/<event_id>', methods=['GET'])
@admin_required
def admin_get_dlp_event(event_id: str):
    """Fetch any DLP event (cross-workspace) for platform admins."""
    if not validate_object_id(event_id):
        return jsonify({'error': 'Invalid event ID'}), 400

    event = DLPEventModel.find_by_id(event_id)
    if event is None:
        return jsonify({'error': 'Event not found', 'code': 'not_found'}), 404

    return jsonify({'event': serialize_doc(event)}), 200


@dlp_bp.route('/admin/dlp/stats', methods=['GET'])
@admin_required
def admin_get_dlp_stats():
    """Global DLP stats for platform admins."""
    try:
        days = int(request.args.get('days', 7))
    except (TypeError, ValueError):
        return jsonify({'error': 'days must be an integer'}), 400
    days = max(1, min(365, days))

    stats = DLPEventModel.aggregate_global_stats(days=days)
    return jsonify(serialize_doc(stats)), 200
