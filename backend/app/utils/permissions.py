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
    """Project-scoped access check. Phase 2 will implement real logic.

    For Phase 1 we fail closed so any premature use of the helper denies access.
    """
    return False
