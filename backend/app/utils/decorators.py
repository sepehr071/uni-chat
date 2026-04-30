from functools import wraps
from flask import jsonify, request
from flask_jwt_extended import get_current_user, verify_jwt_in_request

from app.utils.permissions import check_workspace_access


def admin_required(fn):
    """Decorator to require admin role for a route"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        current_user = get_current_user()
        if not current_user or current_user.get('role') != 'admin':
            return jsonify({'error': 'Admin access required', 'status': 403}), 403
        return fn(*args, **kwargs)
    return wrapper


def active_user_required(fn):
    """Decorator to require non-banned user"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        current_user = get_current_user()
        if not current_user:
            return jsonify({'error': 'User not found', 'status': 404}), 404
        if current_user.get('status', {}).get('is_banned', False):
            return jsonify({
                'error': 'Account has been suspended',
                'reason': current_user.get('status', {}).get('ban_reason', 'No reason provided'),
                'status': 403
            }), 403
        return fn(*args, **kwargs)
    return wrapper


def workspace_member(min_role='viewer', id_kwarg='wid'):
    """Gate a route on workspace membership.

    Reads the workspace id from the URL kwarg `id_kwarg` (default 'wid') and
    requires the JWT-authenticated user to hold at least `min_role` in that
    workspace.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            current_user = get_current_user()
            if not current_user:
                return jsonify({'error': 'User not found', 'status': 404}), 404
            workspace_id = kwargs.get(id_kwarg)
            if not workspace_id:
                return jsonify({'error': f'Missing {id_kwarg} in URL', 'status': 400}), 400
            if not check_workspace_access(current_user['_id'], workspace_id, min_role):
                return jsonify({'error': 'Workspace access denied', 'status': 403}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
