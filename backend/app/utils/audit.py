from functools import wraps
from flask import request
from flask_jwt_extended import get_current_user
from app.models.audit_log import AuditLogModel


def audit_action(action, get_target=None, get_details=None):
    """
    Decorator to log administrative actions

    Args:
        action: The action type (e.g., 'user_ban', 'password_change')
        get_target: Function to extract target_id from request/response
        get_details: Function to extract additional details
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            result = f(*args, **kwargs)

            try:
                admin = get_current_user()
                admin_id = str(admin['_id']) if admin else None

                target_id = None
                target_type = None
                details = {}

                if get_target:
                    target_info = get_target(request, kwargs, result)
                    if isinstance(target_info, tuple):
                        target_id, target_type = target_info
                    else:
                        target_id = target_info

                if get_details:
                    details = get_details(request, kwargs, result)

                ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)

                AuditLogModel.create(
                    action=action,
                    admin_id=admin_id,
                    target_id=target_id,
                    target_type=target_type,
                    details=details,
                    ip_address=ip_address
                )
            except Exception as e:
                print(f"Failed to create audit log: {e}")

            return result
        return wrapped
    return decorator


# Pre-defined audit decorators for common actions
def audit_user_ban(f):
    return audit_action(
        action='user_ban',
        get_target=lambda req, kwargs, res: (kwargs.get('user_id'), 'user'),
        get_details=lambda req, kwargs, res: {'reason': req.get_json().get('reason', '')}
    )(f)


def audit_user_unban(f):
    return audit_action(
        action='user_unban',
        get_target=lambda req, kwargs, res: (kwargs.get('user_id'), 'user')
    )(f)


def audit_role_change(f):
    return audit_action(
        action='role_change',
        get_target=lambda req, kwargs, res: (kwargs.get('user_id'), 'user'),
        get_details=lambda req, kwargs, res: {'new_role': req.get_json().get('role', '')}
    )(f)


def audit_template_create(f):
    return audit_action(
        action='template_create',
        get_details=lambda req, kwargs, res: {'name': req.get_json().get('name', '')}
    )(f)


def audit_template_delete(f):
    return audit_action(
        action='template_delete',
        get_target=lambda req, kwargs, res: (kwargs.get('template_id'), 'template')
    )(f)
