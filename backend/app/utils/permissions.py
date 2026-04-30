"""Permissions helpers for workspace + project access checks.

Module-level functions only — no class. Decorators that consume these helpers
live in `app.utils.decorators`.
"""

from app.models.workspace_member import WorkspaceMemberModel, ROLE_HIERARCHY


def get_workspace_role(user_id, workspace_id):
    """Return the active role string for a user in a workspace, or None.

    Returns one of 'owner' | 'editor' | 'viewer', or None if there is no
    active membership.
    """
    member = WorkspaceMemberModel.find(workspace_id, user_id)
    if not member or member.get('status') != 'active':
        return None
    return member.get('role')


def check_workspace_access(user_id, workspace_id, min_role: str = 'viewer') -> bool:
    """Return True iff the user has at least `min_role` in the workspace."""
    role = get_workspace_role(user_id, workspace_id)
    if role is None:
        return False
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min_role]


def check_project_access(user_id, project_id, min_role: str = 'viewer') -> bool:
    """Bool: user has at least min_role in project.

    Order:
      1. Project membership (explicit role on this project) — wins.
      2. Workspace role for the project's workspace — falls back. Workspace
         owner becomes implicit project owner; workspace editor → project editor;
         workspace viewer → project viewer.
    """
    from app.models.project import ProjectModel
    from app.models.project_member import ProjectMemberModel

    project = ProjectModel.find_by_id(project_id)
    if not project:
        return False

    # 1. Explicit project membership.
    membership = ProjectMemberModel.find(project_id, user_id)
    if membership:
        member_role = membership.get('role')
        if member_role in ROLE_HIERARCHY and ROLE_HIERARCHY[member_role] >= ROLE_HIERARCHY[min_role]:
            return True

    # 2. Fall back to workspace role.
    ws_role = get_workspace_role(user_id, project['workspace_id'])
    if ws_role is None:
        return False
    return ROLE_HIERARCHY[ws_role] >= ROLE_HIERARCHY[min_role]


def get_project_role(user_id, project_id):
    """Effective role of user on project (max of explicit membership + ws fallback)."""
    from app.models.project import ProjectModel
    from app.models.project_member import ProjectMemberModel

    project = ProjectModel.find_by_id(project_id)
    if not project:
        return None

    explicit = None
    m = ProjectMemberModel.find(project_id, user_id)
    if m:
        explicit = m.get('role')

    ws_role = get_workspace_role(user_id, project['workspace_id'])

    candidates = [r for r in (explicit, ws_role) if r in ROLE_HIERARCHY]
    if not candidates:
        return None
    return max(candidates, key=lambda r: ROLE_HIERARCHY[r])
