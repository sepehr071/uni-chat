import os
from functools import wraps

from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.user import UserModel


def admin_required(fn):
    """Route decorator that requires the caller to be the configured admin user.

    Wraps @jwt_required() so callers only need @admin_required — do NOT stack
    both decorators.  Compares caller email against the ADMIN_EMAIL env var
    (same pattern used in app/__init__.py and routes/admin.py).
    """
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        user_id = get_jwt_identity()
        user = UserModel.find_by_id(user_id)
        admin_email = os.environ.get('ADMIN_EMAIL')
        if not user or not admin_email or user.get('email') != admin_email:
            return jsonify({'error': 'admin access required'}), 403
        return fn(*args, **kwargs)
    return wrapper
