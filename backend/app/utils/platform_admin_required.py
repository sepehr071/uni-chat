from functools import wraps

from flask import jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

from app.models.platform_admin import PlatformAdminModel


def platform_admin_required(fn):
    """Route decorator that requires the caller's JWT to carry
    `is_platform_admin=True` AND for a matching `platform_admins` row to exist.

    Stashes the loaded platform admin doc on `flask.g.platform_admin`.
    Do NOT also stack @jwt_required() — this calls verify_jwt_in_request().
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get('is_platform_admin'):
            return jsonify({'error': 'Platform admin access required', 'status': 403}), 403
        pa_id = get_jwt_identity()
        pa = PlatformAdminModel.find_by_id(pa_id)
        if not pa:
            return jsonify({'error': 'Platform admin not found', 'status': 404}), 404
        g.platform_admin = pa
        return fn(*args, **kwargs)
    return wrapper
