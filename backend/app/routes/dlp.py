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

import base64
import hmac
import hashlib
import logging
import re
import time as _time
import uuid
from collections import deque
from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_current_user

from app.models.dlp_event import DLPEventModel, VALID_STATUSES
from app.models.workspace import WorkspaceModel
from app.services.dlp_rules import BUILTIN_RULES
from app.services.dlp_service import DLPDetector, effective_policy
from app.utils.decorators import active_user_required, admin_required, workspace_member
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import check_workspace_access

logger = logging.getLogger(__name__)

dlp_bp = Blueprint('dlp', __name__)

# ---------------------------------------------------------------------------
# DLP confirm-token signing — HMAC-bound to (text_sha256, user, workspace, exp)
# ---------------------------------------------------------------------------

# 5-minute TTL — long enough for a human to read the violation modal and click
# "Send anyway", short enough that a leaked token can't be replayed at leisure.
_DLP_CONFIRM_TOKEN_TTL_S = 300


def _hmac_key() -> bytes:
    """Pull the HMAC key from JWT_SECRET_KEY (validated ≥32 bytes at boot)."""
    secret = current_app.config.get('JWT_SECRET_KEY') or ''
    if isinstance(secret, str):
        secret = secret.encode('utf-8')
    return secret


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(s: str) -> bytes:
    pad = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign_dlp_token(payload: str) -> str:
    """Return ``<payload_b64>.<hmac_b64>``.

    Payload format is the caller's choice but conventionally:
    ``f"{text_sha256}|{user_id}|{workspace_id or ''}|{exp_epoch}"``.
    """
    payload_b = payload.encode('utf-8')
    mac = hmac.new(_hmac_key(), payload_b, hashlib.sha256).digest()
    return f"{_b64url(payload_b)}.{_b64url(mac)}"


def _verify_dlp_token(
    token: str,
    *,
    text_sha256: str,
    user_id: str,
    workspace_id: Optional[str],
) -> bool:
    """Verify HMAC + expiry + payload match.

    Returns True only when ALL of the following hold:
      - token parses as `<payload_b64>.<hmac_b64>`
      - HMAC verifies under the current JWT_SECRET_KEY (constant-time compare)
      - payload binds to (text_sha256, user_id, workspace_id or '')
      - exp_epoch is in the future

    Block actions are unaffected — this token only loosens `require_confirm`.
    """
    if not token or not isinstance(token, str) or '.' not in token:
        return False
    try:
        payload_b64, sig_b64 = token.split('.', 1)
        payload_bytes = _b64url_decode(payload_b64)
        sig_bytes = _b64url_decode(sig_b64)
    except Exception:
        return False
    expected = hmac.new(_hmac_key(), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, sig_bytes):
        return False
    try:
        payload = payload_bytes.decode('utf-8')
        parts = payload.split('|')
        if len(parts) != 4:
            return False
        t_sha, t_uid, t_wid, t_exp = parts
        if t_sha != text_sha256:
            return False
        if t_uid != str(user_id):
            return False
        if t_wid != (str(workspace_id) if workspace_id else ''):
            return False
        if int(t_exp) <= int(_time.time()):
            return False
    except Exception:
        return False
    return True

# ---------------------------------------------------------------------------
# Per-user rate limiter for /dlp/scan
# 60 calls per 60-second rolling window, in-memory PER GUNICORN WORKER.
#
# `gunicorn.conf.py` runs `gthread` workers (threads share memory inside a
# worker but NOT across workers), so the effective cap is
# `workers * _RATE_LIMIT_MAX` requests/window. A hostile burst from one user
# can fan out across workers and exceed the documented limit; this is a known
# trade-off versus paying a Redis/Mongo round-trip on every scan. If we ever
# need a hard global cap, plumb this through `app.services.stream_state` (which
# is already Mongo-backed) instead.
# ---------------------------------------------------------------------------

_RATE_LIMIT_WINDOW = 60        # seconds
_RATE_LIMIT_MAX = 60           # max calls per window
_scan_rate: dict[str, deque] = {}  # user_id -> deque of timestamps

# Inactivity sweep — bound the dict size so a long-running worker doesn't grow
# `_scan_rate` linearly with unique-users-ever-seen. Triggered every Nth call
# rather than on a wall-clock timer so we don't need a background thread.
_SWEEP_EVERY_N = 200
_sweep_counter = 0


def _sweep_inactive_buckets(now: float) -> None:
    """Drop user buckets whose deque is empty or whose newest entry is older
    than 2 * window. Cheap O(n) scan; n is bounded by active-users / worker.
    """
    cutoff = now - (2 * _RATE_LIMIT_WINDOW)
    stale = [
        uid for uid, dq in _scan_rate.items()
        if not dq or dq[-1] < cutoff
    ]
    for uid in stale:
        _scan_rate.pop(uid, None)


def _check_rate_limit(user_id: str) -> Optional[int]:
    """Return retry_after seconds if rate-limited, else None."""
    global _sweep_counter
    now = datetime.utcnow().timestamp()
    window_start = now - _RATE_LIMIT_WINDOW

    _sweep_counter += 1
    if _sweep_counter >= _SWEEP_EVERY_N:
        _sweep_counter = 0
        _sweep_inactive_buckets(now)

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

# Action severity ordering — used to enforce per-rule "loosening" floors below.
_ACTION_ORDER = {'allow': 0, 'warn': 1, 'require_confirm': 2, 'block': 3}

# Per-severity minimum allowed override action. The override may go HIGHER
# (tighter) than the floor, but never lower (looser). `critical` is strict:
# overriding it is forbidden entirely — any value other than 'block' is rejected.
_SEVERITY_FLOOR_ACTION = {
    'critical': 'block',           # non-overridable (block-or-reject)
    'high': 'require_confirm',     # may tighten to block, can't loosen below require_confirm
    'medium': 'warn',              # may tighten, can't loosen below warn
    'low': 'allow',                # any value accepted, including 'allow' (disable)
}


def _builtin_severity_map() -> dict[str, str]:
    """rule_id -> default severity, for builtin rules only."""
    return {r['id']: r['severity'] for r in BUILTIN_RULES}


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


_LOCKED_LLM_MODEL = 'google/gemini-3.1-flash-lite'
_VALID_CONFIDENTIAL_ACTIONS = {'warn', 'require_confirm'}
_VALID_RESTRICTED_ACTIONS = {'warn', 'require_confirm', 'block'}


def _validate_llm_classifier(lc: Any) -> tuple[Optional[dict], Optional[str]]:
    if not isinstance(lc, dict):
        return None, "llm_classifier must be an object"
    clean: dict = {}
    if 'enabled' in lc:
        clean['enabled'] = bool(lc['enabled'])
    # Model is locked — silently ignore client-supplied value
    clean['model'] = _LOCKED_LLM_MODEL
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


def _build_policy_payload(body: dict) -> tuple[Optional[dict], Any]:
    """
    Validate and normalise the PUT /dlp/policy request body.
    Returns (clean_payload, error). On success, error is None.
    On failure, error is either a string (simple validation error) OR a dict
    (structured error payload, e.g. rule_override floor violations) that the
    caller jsonifies directly.
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

        # Enforce per-severity floors on builtin rules. Custom (non-builtin) rule_ids
        # bypass the floor — they're user-authored.
        severity_map = _builtin_severity_map()
        violations: list[dict] = []
        for rule_id, action in ro.items():
            severity = severity_map.get(rule_id)
            if severity is None:
                continue  # unknown / custom rule — no floor
            floor = _SEVERITY_FLOOR_ACTION.get(severity)
            if floor is None:
                continue
            if _ACTION_ORDER[action] < _ACTION_ORDER[floor]:
                violations.append({
                    'rule_id': rule_id,
                    'severity': severity,
                    'min_action': floor,
                    'proposed_action': action,
                })
        if violations:
            return None, {
                'error': 'rule_override_below_floor',
                'violations': violations,
            }
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

    body_lang = (body.get('lang') or '').strip()
    user_lang = (
        body_lang
        or current_user.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
        or 'en'
    )[:2].lower()

    detector = DLPDetector.from_workspace(workspace_id)
    result = detector.scan(text, user_lang=user_lang)

    event_id: Optional[ObjectId] = None
    # P2.27 — persist warn events too. Pre-flight has not yet sent the message,
    # so was_sent=False is correct for every action level. Audit dashboards
    # need warn rows to spot policy drift.
    if result.matches and result.highest_action in ('warn', 'block', 'require_confirm'):
        try:
            inserted = DLPEventModel.create(
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
            event_id = inserted.get('_id') if isinstance(inserted, dict) else None
        except Exception:
            pass  # never let event-write failure break the scan response

    # When the highest action is `require_confirm`, mint a short-lived HMAC
    # confirm_token bound to (text_sha256, user, workspace, exp). The
    # chokepoint gates (dlp_gate.gate) will accept `dlp_confirmed=True` ONLY
    # when accompanied by a token that verifies. Block remains non-overridable.
    confirm_token: Optional[str] = None
    if result.matches and result.highest_action == 'require_confirm':
        exp_epoch = int(_time.time()) + _DLP_CONFIRM_TOKEN_TTL_S
        payload = f"{result.text_sha256}|{user_id_str}|{workspace_id or ''}|{exp_epoch}"
        confirm_token = _sign_dlp_token(payload)

    response_body = {
        'result': result.to_dict(),
        'event_id': str(event_id) if event_id else None,
    }
    if confirm_token is not None:
        response_body['confirm_token'] = confirm_token
        response_body['confirm_token_exp'] = int(_time.time()) + _DLP_CONFIRM_TOKEN_TTL_S
    return jsonify(response_body), 200


# ---------------------------------------------------------------------------
# Test classifier playground (owner-only)
# ---------------------------------------------------------------------------

@dlp_bp.route('/dlp/test', methods=['POST'])
@active_user_required
def dlp_test():
    """
    DLP classifier playground — runs a full scan against a sample of text
    WITHOUT persisting a dlp_event and WITHOUT counting against the rate
    limit. Owner-only.

    Body: { text: str, workspace_id: str }
    """
    current_user = get_current_user()

    body = request.get_json(silent=True) or {}
    text = body.get('text', '')
    workspace_id = body.get('workspace_id', '')

    if not text:
        return jsonify({'error': 'text is required'}), 400
    if not workspace_id:
        return jsonify({'error': 'workspace_id is required'}), 400
    if not validate_object_id(workspace_id):
        return jsonify({'error': 'Invalid workspace_id'}), 400

    if not check_workspace_access(current_user['_id'], workspace_id, 'owner'):
        return jsonify({'error': 'Workspace access denied', 'code': 'forbidden'}), 403

    body_lang = (body.get('lang') or '').strip()
    user_lang = (
        body_lang
        or current_user.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
        or 'en'
    )[:2].lower()

    detector = DLPDetector.from_workspace(workspace_id)
    result = detector.scan(text, user_lang=user_lang)

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
        # Structured floor-violation payload (dict) vs simple string error
        if isinstance(err, dict):
            return jsonify(err), 400
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
