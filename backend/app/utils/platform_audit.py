from flask import request as flask_request, g

from app.models.platform_audit_log import PlatformAuditLogModel


def platform_audit_log(action, details=None, target_type=None, target_id=None):
    """Convenience helper for writing one row to `platform_audit_logs`.

    Pulls `platform_admin_id` from `flask.g.platform_admin` (set by the
    `platform_admin_required` decorator) and `ip_address` from the current
    request. Safe to call inside a route handler.
    """
    pa = getattr(g, 'platform_admin', None)
    pa_id = pa['_id'] if pa else None
    ip = (
        flask_request.headers.get('X-Forwarded-For')
        or flask_request.remote_addr
        or ''
    ).split(',')[0].strip() or None
    PlatformAuditLogModel.create(
        action=action,
        platform_admin_id=pa_id,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
        ip_address=ip,
    )
