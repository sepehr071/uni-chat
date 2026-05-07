"""Permissions helpers for workspace + project access checks.

Module-level functions only — no class. Decorators that consume these helpers
live in `app.utils.decorators`.
"""

import logging

from app.models.workspace_member import (
    WorkspaceMemberModel,
    ROLE_HIERARCHY,
)

_logger = logging.getLogger(__name__)

# Legacy roles that callers may pass; mapped to canonical equivalents for one transition release.
_LEGACY_ROLE_MAP = {
    'guest': 'viewer',
    'billing-admin': 'owner',
    'admin': 'owner',
}


def _normalize_min_role(min_role: str) -> str:
    """Map legacy min_role values to canonical ones and emit a deprecation warning."""
    if min_role in _LEGACY_ROLE_MAP:
        canonical = _LEGACY_ROLE_MAP[min_role]
        _logger.warning("permissions: legacy min_role=%r mapped to %r", min_role, canonical)
        return canonical
    return min_role


def _is_super_admin(user_id) -> bool:
    """Global super-admin (user.role='admin') bypass — sees + does anything."""
    if user_id is None:
        return False
    try:
        from app.models.user import UserModel
        from bson import ObjectId
        uid = user_id if isinstance(user_id, ObjectId) else ObjectId(str(user_id))
        u = UserModel.get_collection().find_one({'_id': uid}, {'role': 1})
        return bool(u and u.get('role') == 'admin')
    except Exception:
        return False


def get_workspace_role(user_id, workspace_id):
    """Return the active role string for a user in a workspace, or None.

    Returns one of the keys of ROLE_HIERARCHY, or None if there is no
    active membership.
    """
    member = WorkspaceMemberModel.find(workspace_id, user_id)
    if not member or member.get('status') != 'active':
        return None
    return member.get('role')


def check_workspace_access(user_id, workspace_id, min_role: str = 'viewer') -> bool:
    """Return True iff the user has at least `min_role` in the workspace.

    Global `user.role='admin'` is a super-admin bypass — always True.
    """
    if _is_super_admin(user_id):
        return True
    min_role = _normalize_min_role(min_role)
    role = get_workspace_role(user_id, workspace_id)
    if role is None:
        return False
    # Normalize actual stored role through legacy map too (handles old DB rows).
    role = _LEGACY_ROLE_MAP.get(role, role)
    if min_role not in ROLE_HIERARCHY or role not in ROLE_HIERARCHY:
        return False
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min_role]


def _meets(role: str, min_role: str) -> bool:
    """True if role grants at least min_role under the project access semantics."""
    min_role = _normalize_min_role(min_role)
    # Normalize actual stored role through legacy map too (handles old DB rows).
    role = _LEGACY_ROLE_MAP.get(role, role) if role else role
    if not role or role not in ROLE_HIERARCHY or min_role not in ROLE_HIERARCHY:
        return False
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min_role]


def check_project_access(user_id, project_id, min_role: str = 'viewer') -> bool:
    """Bool: user has at least min_role in project.

    Resolution order (any one passing returns True):
      1. Explicit project_members row.
      2. Group-based access: project_group_access × group_members.
         Honors expires_at — expired grants are ignored.
      3. Workspace role for the project's workspace.
    """
    from app.models.project import ProjectModel
    from app.models.project_member import ProjectMemberModel

    project = ProjectModel.find_by_id(project_id)
    if not project:
        return False

    # 1. Explicit project membership.
    membership = ProjectMemberModel.find(project_id, user_id)
    if membership and _meets(membership.get('role'), min_role):
        return True

    # 2. Group access — best-effort lookup; never raise on import errors.
    try:
        from app.models.project_group_access import ProjectGroupAccessModel
        group_grants = ProjectGroupAccessModel.find_groups_with_access(project_id, user_id)
        for grant in group_grants:
            if _meets(grant.get('role'), min_role):
                return True
    except Exception:
        # Defensive — collection may not exist in legacy DBs.
        pass

    # 3. Fall back to workspace role.
    ws_role = get_workspace_role(user_id, project['workspace_id'])
    return _meets(ws_role, min_role) if ws_role else False


def get_project_role(user_id, project_id):
    """Effective role of user on project (max of explicit membership + group + ws fallback)."""
    from app.models.project import ProjectModel
    from app.models.project_member import ProjectMemberModel

    project = ProjectModel.find_by_id(project_id)
    if not project:
        return None

    explicit = None
    m = ProjectMemberModel.find(project_id, user_id)
    if m:
        explicit = m.get('role')

    group_role = None
    try:
        from app.models.project_group_access import ProjectGroupAccessModel
        grants = ProjectGroupAccessModel.find_groups_with_access(project_id, user_id)
        for g in grants:
            r = g.get('role')
            if r in ROLE_HIERARCHY:
                if group_role is None or ROLE_HIERARCHY[r] > ROLE_HIERARCHY[group_role]:
                    group_role = r
    except Exception:
        group_role = None

    ws_role = get_workspace_role(user_id, project['workspace_id'])

    candidates = [r for r in (explicit, group_role, ws_role) if r in ROLE_HIERARCHY]
    if not candidates:
        return None
    return max(candidates, key=lambda r: ROLE_HIERARCHY[r])
