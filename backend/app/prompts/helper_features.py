"""
Feature catalog for the in-app Helper guide.

`FEATURES` is the single source of truth for every user-facing route the
Helper can recommend. Each entry carries a `min_role` so the prompt builder
can hide gated features from users who can't reach them.

Permission tiers:
    min_role = None        -> any authenticated user
    min_role = 'manager'   -> users with global role 'manager' or 'admin'
    min_role = 'admin'     -> users with global role 'admin' (super-admin)
    min_role = 'owner'     -> workspace owner role (member_role)
"""
from __future__ import annotations

from typing import Optional


FEATURES: list[dict] = [
    {
        'route': '/chat',
        'name': 'Chat',
        'one_liner': 'Stream conversations with any model + custom assistant.',
        'min_role': None,
    },
    {
        'route': '/dashboard',
        'name': 'Dashboard',
        'one_liner': 'Snapshot of recent activity, pinned items, and quick actions.',
        'min_role': None,
    },
    {
        'route': '/chat-history',
        'name': 'Chat History',
        'one_liner': 'Search, filter, and revisit every past conversation.',
        'min_role': None,
    },
    {
        'route': '/image-history',
        'name': 'Image History',
        'one_liner': 'Browse and re-download every image you generated.',
        'min_role': None,
    },
    {
        'route': '/configs',
        'name': 'Configs',
        'one_liner': 'Create custom assistants with model + system prompt + parameters.',
        'min_role': None,
    },
    {
        'route': '/workflow',
        'name': 'Workflow Editor',
        'one_liner': 'Build multi-step AI pipelines on a node canvas.',
        'min_role': None,
    },
    {
        'route': '/arena',
        'name': 'Arena',
        'one_liner': 'Compare 2-4 models side-by-side on the same prompt.',
        'min_role': None,
    },
    {
        'route': '/debate',
        'name': 'Debate',
        'one_liner': 'Run a structured debate between 2-5 LLMs with a judge verdict.',
        'min_role': None,
    },
    {
        'route': '/knowledge',
        'name': 'Knowledge Vault',
        'one_liner': 'Bookmark AI responses into folders for re-use as context.',
        'min_role': None,
    },
    {
        'route': '/image-studio',
        'name': 'Image Studio',
        'one_liner': 'Text-to-image and image-to-image generation across Gemini + GPT models.',
        'min_role': None,
    },
    {
        'route': '/automate-agent',
        'name': 'Automate Agent',
        'one_liner': 'Natural-language browser automation tasks via the Cloud agent.',
        'min_role': None,
    },
    {
        'route': '/routines',
        'name': 'Routines',
        'one_liner': 'Cron-scheduled LLM tasks that deliver to chat, knowledge, or Telegram.',
        'min_role': None,
    },
    {
        'route': '/projects',
        'name': 'Projects',
        'one_liner': 'Group chats, configs, workflows, and knowledge under a project.',
        'min_role': None,
    },
    {
        'route': '/workspaces/<wid>',
        'name': 'Company Overview',
        'one_liner': 'Company-level activity, members, and projects.',
        'min_role': None,
    },
    {
        'route': '/workspaces/<wid>/settings',
        'name': 'Company Settings',
        'one_liner': 'Manage members, billing, activity, content safety, and danger zone.',
        'min_role': 'owner',
    },
    {
        'route': '/settings',
        'name': 'Settings',
        'one_liner': 'AI preferences, language, theme, Telegram link, timezone.',
        'min_role': None,
    },
    {
        'route': '/my-canvases',
        'name': 'My Canvases',
        'one_liner': 'Saved runnable code artifacts from chat (HTML/CSS/JS).',
        'min_role': None,
    },
    {
        'route': '/admin',
        'name': 'Admin Dashboard',
        'one_liner': 'Platform-wide stats and admin entry point.',
        'min_role': 'admin',
    },
    {
        'route': '/admin/users',
        'name': 'User Management',
        'one_liner': 'Promote, ban, or inspect any user across the holding.',
        'min_role': 'admin',
    },
    {
        'route': '/admin/templates',
        'name': 'Templates',
        'one_liner': 'Manage shared LLM config + workflow templates.',
        'min_role': 'admin',
    },
    {
        'route': '/admin/audit',
        'name': 'Audit Log',
        'one_liner': 'Cross-tenant audit trail for sensitive actions.',
        'min_role': 'admin',
    },
    {
        'route': '/admin/companies',
        'name': 'Companies (Admin)',
        'one_liner': 'Super-admin holding view across every company.',
        'min_role': 'admin',
    },
    {
        'route': '/admin/dlp',
        'name': 'DLP Dashboard',
        'one_liner': 'Cross-company Content Safety event log and policy drift view.',
        'min_role': 'admin',
    },
]


# Member-role hierarchy for workspace roles (mirrors workspace_member.ROLE_HIERARCHY).
_MEMBER_HIERARCHY = {'viewer': 1, 'editor': 2, 'owner': 3}


def _meets_min_role(
    min_role: Optional[str],
    user_role: str,
    member_role: Optional[str],
) -> bool:
    """Return True if the user can access a feature gated by `min_role`."""
    if min_role is None:
        return True
    # Global super-admin sees everything.
    if user_role == 'admin':
        return True
    if min_role == 'admin':
        return user_role == 'admin'
    if min_role == 'manager':
        return user_role in ('admin', 'manager')
    if min_role in _MEMBER_HIERARCHY:
        # Workspace-scoped role check.
        if not member_role or member_role not in _MEMBER_HIERARCHY:
            return False
        return _MEMBER_HIERARCHY[member_role] >= _MEMBER_HIERARCHY[min_role]
    return False


def build_features_section(user_role: str, member_role: Optional[str]) -> str:
    """Markdown bullet list of features visible to this user, for the system prompt."""
    user_role = user_role or 'user'
    visible = [
        f
        for f in FEATURES
        if _meets_min_role(f.get('min_role'), user_role, member_role)
    ]
    lines = [
        f"- **{f['name']}** (`{f['route']}`): {f['one_liner']}"
        for f in visible
    ]
    return '\n'.join(lines)
