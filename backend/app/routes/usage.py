from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.usage_log import UsageLogModel
from app.utils.admin_required import admin_required

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


@usage_bp.route('/usage/me', methods=['GET'])
@jwt_required()
def get_my_usage():
    """Return usage aggregation for the current user.

    Query params:
      from       — ISO date string (inclusive lower bound)
      to         — ISO date string (inclusive upper bound)
      group_by   — feature | model | day  (default: feature)
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

    total_cost = sum(row.get('total_cost', 0) for row in data)
    total_tokens = sum(row.get('total_tokens', 0) for row in data)

    return jsonify({
        'data': data,
        'total_cost': total_cost,
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
