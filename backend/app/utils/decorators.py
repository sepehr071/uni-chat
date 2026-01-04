from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_current_user, verify_jwt_in_request


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
