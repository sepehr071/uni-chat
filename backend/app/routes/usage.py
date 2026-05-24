from datetime import datetime

from bson import ObjectId
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.usage_log import UsageLogModel
from app.models.user import UserModel
from app.models.workspace_member import WorkspaceMemberModel
from app.utils.decorators import admin_required

usage_bp = Blueprint('usage', __name__)


def _parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 date string to datetime, returning None on failure."""
    if not value:
        return None
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _owner_workspace_ids(user_id) -> set:
    """Return the set of workspace ObjectIds in which user is an active owner.

    Used to scope `$`-figure visibility on `/usage/me` — per CLAUDE.md
    "Billing tab is the single surface; $-figures owner-only".
    """
    memberships = WorkspaceMemberModel.find_by_user(user_id, status='active')
    return {
        m['workspace_id']
        for m in memberships
        if m.get('role') == 'owner' and m.get('workspace_id') is not None
    }


def _row_workspace_ids(group_by: str, user_id, from_, to) -> dict:
    """Map each aggregate row key to the set of workspace_ids that produced it.

    Mirrors the match + grouping logic of `UsageLogModel.aggregate_by` but
    additionally projects `workspace_id` so the route can mask costs per-row
    based on the requesting user's role in each workspace.
    """
    match = {'user_id': ObjectId(user_id) if isinstance(user_id, str) else user_id}
    if from_ or to:
        match['created_at'] = {}
        if from_:
            match['created_at']['$gte'] = from_
        if to:
            match['created_at']['$lte'] = to

    if group_by == 'feature':
        key_expr = '$feature'
    elif group_by == 'model':
        key_expr = '$model_id'
    elif group_by == 'user':
        key_expr = '$user_id'
    elif group_by == 'day':
        key_expr = {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}}
    else:
        return {}

    pipeline = [
        {'$match': match},
        {'$group': {
            '_id': {'key': key_expr, 'workspace_id': '$workspace_id'},
        }},
    ]
    out: dict = {}
    for doc in UsageLogModel.get_collection().aggregate(pipeline):
        key = str(doc['_id'].get('key'))
        wid = doc['_id'].get('workspace_id')
        out.setdefault(key, set()).add(wid)
    return out


@usage_bp.route('/usage/me', methods=['GET'])
@jwt_required()
def get_my_usage():
    """Return usage aggregation for the current user.

    Query params:
      from       — ISO date string (inclusive lower bound)
      to         — ISO date string (inclusive upper bound)
      group_by   — feature | model | day  (default: feature)

    Cost-visibility rules (per CLAUDE.md "$-figures owner-only"):
      - Super-admin (`user.role='admin'`)  -> all costs visible.
      - Workspace owner                    -> cost visible only for rows that
                                              originated in a workspace they
                                              own.
      - Anyone else                        -> `total_cost` masked to `None`.
    Top-level `total_cost` sums only the rows whose cost survives the mask;
    it is masked to `None` if NO row survives.
    """
    user_id = get_jwt_identity()
    group_by = request.args.get('group_by', 'feature')
    from_ = _parse_iso(request.args.get('from'))
    to = _parse_iso(request.args.get('to'))

    try:
        data = UsageLogModel.aggregate_by(
            group_by=group_by,
            user_id=user_id,
            from_=from_,
            to=to,
        )
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

    user = UserModel.find_by_id(user_id) or {}
    is_super_admin = user.get('role') == 'admin'

    if is_super_admin:
        # Super-admins already have the Holding admin view — show everything.
        total_cost = sum(row.get('total_cost', 0) for row in data)
        total_tokens = sum(row.get('total_tokens', 0) for row in data)
        return jsonify({
            'data': data,
            'total_cost': total_cost,
            'total_tokens': total_tokens,
        }), 200

    owner_ws_ids = _owner_workspace_ids(user_id)
    row_ws_map = _row_workspace_ids(group_by, user_id, from_, to)

    visible_total_cost = 0.0
    any_visible = False
    for row in data:
        row_wids = row_ws_map.get(row.get('key'), set())
        # A row survives masking iff at least one of its source workspaces
        # is owned by the requester. (Rows with `workspace_id=None` — e.g.
        # personal-scope features like meetings/telegram — are never
        # owner-attributable, so they always mask.)
        owned_intersect = row_wids & owner_ws_ids
        if owned_intersect:
            visible_total_cost += row.get('total_cost', 0) or 0
            any_visible = True
        else:
            row['total_cost'] = None

    total_tokens = sum(row.get('total_tokens', 0) for row in data)

    return jsonify({
        'data': data,
        'total_cost': visible_total_cost if any_visible else None,
        'total_tokens': total_tokens,
    }), 200


@usage_bp.route('/admin/usage', methods=['GET'])
@admin_required
def get_admin_usage():
    """Return usage aggregation across all users.  Admin only.

    Same query params as /me plus:
      per_user  — true | false  (when group_by=user, include per-user breakdown)
    """
    group_by = request.args.get('group_by', 'feature')
    from_ = _parse_iso(request.args.get('from'))
    to = _parse_iso(request.args.get('to'))
    per_user = request.args.get('per_user', 'false').lower() == 'true'

    try:
        data = UsageLogModel.aggregate_by(
            group_by=group_by,
            user_id=None,  # all users
            from_=from_,
            to=to,
        )
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500

    total_cost = sum(row.get('total_cost', 0) for row in data)
    total_tokens = sum(row.get('total_tokens', 0) for row in data)

    result = {
        'data': data,
        'total_cost': total_cost,
        'total_tokens': total_tokens,
    }

    if per_user and group_by == 'user':
        result['per_user'] = data  # already broken down by user when group_by=user

    return jsonify(result), 200
