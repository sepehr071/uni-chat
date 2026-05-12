from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from bson import ObjectId

from app.extensions import mongo
from app.models.credit_ledger import CreditLedgerModel
from app.models.platform_admin import PlatformAdminModel
from app.models.platform_settings import PlatformSettingsModel, DEFAULT_FEATURES
from app.models.platform_audit_log import PlatformAuditLogModel
from app.models.workspace import WorkspaceModel
from app.services import holding_analytics
from app.utils.helpers import serialize_doc
from app.utils.platform_admin_required import platform_admin_required
from app.utils.platform_audit import platform_audit_log

platform_bp = Blueprint('platform', __name__)


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

@platform_bp.route('/me', methods=['GET'])
@platform_admin_required
def get_me():
    """Return the logged-in platform admin profile."""
    from flask import g
    pa = g.platform_admin
    PlatformAdminModel.update_last_active(pa['_id'])
    return jsonify({
        'id': str(pa['_id']),
        'email': pa.get('email'),
        'display_name': pa.get('display_name'),
        'role': 'platform_admin',
        'is_platform_admin': True,
    }), 200


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

def _resolve_updated_by(updated_by):
    """Hydrate updated_by (ObjectId) -> {id, email, display_name} or None."""
    if not updated_by:
        return None
    pa = PlatformAdminModel.find_by_id(updated_by)
    if not pa:
        return None
    return {
        'id': str(pa['_id']),
        'email': pa.get('email'),
        'display_name': pa.get('display_name'),
    }


@platform_bp.route('/features', methods=['GET'])
@platform_admin_required
def get_features():
    """Return current feature flags + updated_at + updated_by metadata."""
    doc = PlatformSettingsModel.get()
    return jsonify({
        'features': doc['features'],
        'updated_at': doc['updated_at'].isoformat() if doc.get('updated_at') else None,
        'updated_by': _resolve_updated_by(doc.get('updated_by')),
    }), 200


@platform_bp.route('/features', methods=['PUT'])
@platform_admin_required
def set_features():
    """Toggle one or many feature flags.

    Accepts either:
        {"feature": "arena", "enabled": true}
        {"features": {"arena": true, "debate": false}}

    Writes a single platform_audit_log row per call.
    """
    from flask import g
    data = request.get_json(silent=True) or {}

    by_id = g.platform_admin['_id']
    before = PlatformSettingsModel.get()['features']

    # Build the desired delta
    delta = {}
    if 'feature' in data:
        name = (data.get('feature') or '').strip()
        if name not in DEFAULT_FEATURES:
            return jsonify({
                'error': f"Unknown feature: {name!r}",
                'allowed': sorted(DEFAULT_FEATURES.keys()),
            }), 400
        if 'enabled' not in data or not isinstance(data['enabled'], bool):
            return jsonify({'error': "`enabled` (bool) required when toggling a single feature"}), 400
        delta[name] = bool(data['enabled'])
    elif 'features' in data:
        features = data.get('features') or {}
        if not isinstance(features, dict) or not features:
            return jsonify({'error': "`features` must be a non-empty object"}), 400
        unknown = [k for k in features.keys() if k not in DEFAULT_FEATURES]
        if unknown:
            return jsonify({
                'error': f"Unknown feature keys: {unknown}",
                'allowed': sorted(DEFAULT_FEATURES.keys()),
            }), 400
        for k, v in features.items():
            if not isinstance(v, bool):
                return jsonify({'error': f"Feature {k!r} value must be bool"}), 400
            delta[k] = v
    else:
        return jsonify({'error': "Must provide either {feature, enabled} or {features:{...}}"}), 400

    # Filter to only actual changes for the audit record
    changes = []
    for name, new_val in delta.items():
        old_val = bool(before.get(name, DEFAULT_FEATURES.get(name, False)))
        if old_val != new_val:
            changes.append({'name': name, 'old': old_val, 'new': new_val})

    try:
        updated = PlatformSettingsModel.bulk_set(delta, by_id)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    # One audit row per call, listing every changed flag in `details.features`.
    if changes:
        platform_audit_log(
            action='feature_toggle',
            target_type='platform_settings',
            target_id='singleton',
            details={'features': changes},
        )

    return jsonify({
        'features': updated['features'],
        'updated_at': updated['updated_at'].isoformat() if updated.get('updated_at') else None,
        'updated_by': _resolve_updated_by(updated.get('updated_by')),
        'changes': changes,
    }), 200


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@platform_bp.route('/audit', methods=['GET'])
@platform_admin_required
def list_audit():
    """Paginated platform audit log. Joins admin display_name + email."""
    try:
        skip = max(0, int(request.args.get('skip', 0)))
    except (TypeError, ValueError):
        skip = 0
    try:
        limit = int(request.args.get('limit', 50))
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 200))

    action = request.args.get('action') or None
    days_raw = request.args.get('days')
    days = None
    if days_raw:
        try:
            days = max(1, int(days_raw))
        except (TypeError, ValueError):
            days = None

    rows, total = PlatformAuditLogModel.find_paginated(
        skip=skip, limit=limit, action=action, days=days,
    )

    # Hydrate platform_admin reference per row
    admin_ids = list({r['platform_admin_id'] for r in rows if r.get('platform_admin_id')})
    admin_map = {}
    if admin_ids:
        admins = PlatformAdminModel.get_collection().find(
            {'_id': {'$in': admin_ids}},
            {'email': 1, 'display_name': 1},
        )
        admin_map = {a['_id']: a for a in admins}

    events = []
    for row in rows:
        pa_id = row.get('platform_admin_id')
        admin_doc = admin_map.get(pa_id) if pa_id else None
        events.append({
            '_id': str(row['_id']),
            'action': row.get('action'),
            'platform_admin_id': str(pa_id) if pa_id else None,
            'platform_admin': {
                'id': str(admin_doc['_id']),
                'email': admin_doc.get('email'),
                'display_name': admin_doc.get('display_name'),
            } if admin_doc else None,
            'target_type': row.get('target_type'),
            'target_id': str(row['target_id']) if isinstance(row.get('target_id'), ObjectId) else row.get('target_id'),
            'details': row.get('details') or {},
            'ip_address': row.get('ip_address'),
            'created_at': row['created_at'].isoformat() if row.get('created_at') else None,
        })

    return jsonify({
        'events': events,
        'total': total,
        'skip': skip,
        'limit': limit,
    }), 200


# ---------------------------------------------------------------------------
# Holding overview
# ---------------------------------------------------------------------------

@platform_bp.route('/holding/overview', methods=['GET'])
@platform_admin_required
def holding_overview():
    """Holding-wide analytics: counts + window cost/tokens/calls + daily series + top companies/models + by_role + holding-credits."""
    days = int(request.args.get('days', 30))
    payload = holding_analytics.holding_overview(days=days)
    # Back-compat: keep old top-level key consumed by existing HoldingOverviewPage.
    # (P2.33 — both branches of the original ternary returned the same value;
    # collapsed to a single read.)
    payload['usage_30d_cost_usd'] = payload.get('totals', {}).get('cost_usd', 0.0)
    return jsonify(payload), 200


# ---------------------------------------------------------------------------
# Companies — mirror /admin/companies with platform_audit_required guard
# ---------------------------------------------------------------------------

@platform_bp.route('/companies', methods=['GET'])
@platform_admin_required
def list_companies():
    days = int(request.args.get('days', 30))
    return jsonify(holding_analytics.list_companies(days=days)), 200


@platform_bp.route('/companies/<wid>', methods=['GET'])
@platform_admin_required
def get_company(wid):
    if not ObjectId.is_valid(wid):
        return jsonify({'error': 'invalid id'}), 400
    days = int(request.args.get('days', 30))
    payload = holding_analytics.company_detail(wid, days=days)
    if payload is None:
        return jsonify({'error': 'not found'}), 404
    return jsonify(payload), 200


@platform_bp.route('/users-overview', methods=['GET'])
@platform_admin_required
def users_overview():
    try:
        payload = holding_analytics.users_overview(
            days=int(request.args.get('days', 30)),
            page=int(request.args.get('page', 1)),
            limit=int(request.args.get('limit', 50)),
            search=request.args.get('search', ''),
            role=request.args.get('role', ''),
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify(payload), 200


# ---------------------------------------------------------------------------
# Credit charging — company-scoped and holding-scoped
# ---------------------------------------------------------------------------

_LEDGER_TYPES = {'top_up', 'adjustment', 'refund'}


def _parse_credit_body():
    """Shared validator for both company + holding credit endpoints."""
    from flask import g
    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get('amount_usd'))
    except (TypeError, ValueError):
        return None, (jsonify({'error': 'amount_usd (number) is required'}), 400)
    if amount == 0:
        return None, (jsonify({'error': 'amount_usd must be non-zero'}), 400)
    type_ = (data.get('type') or 'top_up').strip().lower()
    if type_ not in _LEDGER_TYPES:
        return None, (jsonify({
            'error': "type must be one of 'top_up' | 'adjustment' | 'refund'",
        }), 400)
    note = (data.get('note') or '').strip()
    return {'amount': amount, 'type': type_, 'note': note}, None


@platform_bp.route('/companies/<wid>/credits', methods=['POST'])
@platform_admin_required
def charge_company(wid):
    """Append a ledger entry to a company and bump materialized balance.

    Platform-admin scoped — bypasses the regular owner check entirely.
    Writes a `platform_audit_log` row in addition to the `credit_ledger` row.
    """
    from flask import g
    if not ObjectId.is_valid(wid):
        return jsonify({'error': 'invalid id'}), 400

    body, err = _parse_credit_body()
    if err:
        return err

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    pa_id = g.platform_admin['_id']
    entry = CreditLedgerModel.add_entry(
        workspace_id=wid,
        amount_usd=body['amount'],
        type=body['type'],
        note=body['note'],
        added_by=pa_id,
    )
    new_balance = float(ws.get('credits_balance_usd') or 0) + body['amount']
    WorkspaceModel.update(wid, {'credits_balance_usd': new_balance})

    platform_audit_log(
        action='company_credits_added',
        target_type='workspace',
        target_id=ObjectId(wid),
        details={
            'amount_usd': body['amount'],
            'type': body['type'],
            'note': body['note'],
            'workspace_name': ws.get('name'),
            'new_balance_usd': new_balance,
        },
    )

    return jsonify({
        'entry': serialize_doc(entry),
        'credits_balance_usd': new_balance,
    }), 201


@platform_bp.route('/holding/credits', methods=['POST'])
@platform_admin_required
def charge_holding():
    """Bump holding-level credit pool on `platform_settings.singleton`.

    Stored on the singleton (not per-workspace). Audit log row carries the
    type / note / IP — that audit trail IS the ledger.
    """
    body, err = _parse_credit_body()
    if err:
        return err

    from flask import g
    pa_id = g.platform_admin['_id']
    doc = PlatformSettingsModel.add_holding_credits(body['amount'], by=pa_id)
    new_topups = float((doc or {}).get('holding_credits_topups_usd') or 0)

    platform_audit_log(
        action='holding_credits_added',
        target_type='holding',
        target_id=None,
        details={
            'amount_usd': body['amount'],
            'type': body['type'],
            'note': body['note'],
            'new_lifetime_topups_usd': new_topups,
        },
    )

    return jsonify({
        'lifetime_topups_usd': round(new_topups, 4),
    }), 201


@platform_bp.route('/holding/ledger', methods=['GET'])
@platform_admin_required
def holding_ledger():
    """List recent holding-scope audit-log rows that recorded credit movements.

    The mongo aggregation now lives in `app.services.holding_analytics` per
    the CLAUDE.md rule ("Cross-company aggregation lives in service" — P2.32).
    """
    payload = holding_analytics.holding_ledger(
        skip=int(request.args.get('skip', 0)),
        limit=int(request.args.get('limit', 50)),
    )
    return jsonify(payload), 200
