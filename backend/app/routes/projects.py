"""
Projects API blueprint.

Endpoints (all protected by JWT + active_user_required):
    GET    /list?workspace_id=<wid>     List projects in a workspace caller can access
    POST   /create                      Create a new project (editor+ in workspace)
    GET    /<pid>                       Get one project + caller role
    PATCH  /<pid>                       Update project (owner only)
    DELETE /<pid>                       Delete project + cascade (owner only)
    POST   /<pid>/members               Add a member (owner only)
    PATCH  /<pid>/members/<uid>         Update a member's role (owner only)
    DELETE /<pid>/members/<uid>         Remove a member (owner only)

All routes use named sub-paths (never bare '/') per CLAUDE.md known issue.
Responses are FLAT JSON (no { project: ... } wrapping) — matches Phase 2A
contract; do NOT change.
"""

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required

from app.extensions import mongo
from app.models.group import GroupModel
from app.models.group_member import GroupMemberModel
from app.models.project import ProjectModel
from app.models.project_group_access import ProjectGroupAccessModel
from app.models.project_member import ProjectMemberModel
from app.models.project_webhook import ProjectWebhookModel
from app.models.user import UserModel
from app.models.workspace import WorkspaceModel
from app.models.workspace_member import ROLE_HIERARCHY
from app.utils.decorators import active_user_required, project_role
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import check_workspace_access, get_project_role

projects_bp = Blueprint('projects', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_MEMBER_ROLES = {'viewer', 'editor'}
_UPDATABLE_FIELDS = {'name', 'color', 'icon', 'description', 'archived'}


def _serialize(doc):
    return serialize_doc(doc)


def _current_user_id_str() -> str:
    user = get_current_user()
    return str(user['_id'])


def _count_explicit_owners(project_id) -> int:
    """Count rows in project_members with role='owner' for this project."""
    pid = ObjectId(project_id) if isinstance(project_id, str) else project_id
    return ProjectMemberModel.get_collection().count_documents({
        'project_id': pid,
        'role': 'owner',
    })


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@projects_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
def list_projects():
    """List projects in a workspace the caller can access.

    Required query param: ?workspace_id=<wid>
    """
    user_id_str = _current_user_id_str()
    workspace_id = request.args.get('workspace_id')

    if not workspace_id:
        return jsonify({'error': 'workspace_id query param is required'}), 400
    if not validate_object_id(workspace_id):
        return jsonify({'error': 'Invalid workspace_id'}), 400

    workspace = WorkspaceModel.find_by_id(workspace_id)
    if not workspace:
        return jsonify({'error': 'Workspace not found'}), 404

    if not check_workspace_access(user_id_str, workspace_id, 'viewer'):
        return jsonify({'error': 'Workspace access denied', 'status': 403}), 403

    projects = ProjectModel.find_by_workspace(workspace_id, archived=False) or []

    out = []
    for p in projects:
        pid_str = str(p['_id'])
        role = get_project_role(user_id_str, pid_str)
        # Skip projects the caller has zero access to. Workspace-owner /
        # editor fallback inside get_project_role should keep most visible.
        if role is None:
            continue
        row = _serialize(p)
        row['member_role'] = role
        out.append(row)

    return jsonify(out), 200


@projects_bp.route('/create', methods=['POST'])
@jwt_required()
@active_user_required
def create_project():
    """Create a new project. Caller must be editor or owner of the workspace."""
    user = get_current_user()
    user_id = user['_id']
    user_id_str = str(user_id)

    data = request.get_json(silent=True) or {}

    workspace_id = data.get('workspace_id')
    if not workspace_id:
        return jsonify({'error': 'workspace_id is required'}), 400
    if not validate_object_id(workspace_id):
        return jsonify({'error': 'Invalid workspace_id'}), 400

    workspace = WorkspaceModel.find_by_id(workspace_id)
    if not workspace:
        return jsonify({'error': 'Workspace not found'}), 404

    if not check_workspace_access(user_id_str, workspace_id, 'editor'):
        return jsonify({'error': 'Workspace access denied', 'status': 403}), 403

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > 100:
        return jsonify({'error': 'name must be at most 100 characters'}), 400

    color = data.get('color') or '#5c9aed'
    icon = data.get('icon')
    description = data.get('description')

    project = ProjectModel.create(
        workspace_id=workspace_id,
        name=name,
        created_by=user_id,
        color=color,
        icon=icon,
        description=description,
    )

    ProjectMemberModel.add(
        project_id=project['_id'],
        user_id=user_id,
        role='owner',
        added_by=user_id,
    )

    return jsonify(_serialize(project)), 201


@projects_bp.route('/<pid>', methods=['GET'])
@jwt_required()
@active_user_required
@project_role(min_role='viewer', id_kwarg='pid')
def get_project(pid: str):
    """Return project doc + caller's role."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    user_id_str = _current_user_id_str()
    role = get_project_role(user_id_str, pid)

    out = _serialize(project)
    out['member_role'] = role
    return jsonify(out), 200


@projects_bp.route('/<pid>', methods=['PATCH'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def update_project(pid: str):
    """Whitelisted update — name, color, icon, description, archived."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    update_data = {}

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        if len(name) > 100:
            return jsonify({'error': 'name must be at most 100 characters'}), 400
        update_data['name'] = name

    if 'color' in data:
        update_data['color'] = data['color']

    if 'icon' in data:
        update_data['icon'] = data['icon']

    if 'description' in data:
        update_data['description'] = data['description']

    if 'archived' in data:
        if not isinstance(data['archived'], bool):
            return jsonify({'error': 'archived must be a boolean'}), 400
        update_data['archived'] = data['archived']

    if 'default_model' in data:
        update_data['default_model'] = data['default_model']

    if 'default_temperature' in data:
        update_data['default_temperature'] = data['default_temperature']

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        ProjectModel.update(pid, update_data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    updated = ProjectModel.find_by_id(pid)
    return jsonify(_serialize(updated)), 200


@projects_bp.route('/<pid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def delete_project(pid: str):
    """Hard-delete project + cascade member rows. Folders + conversations
    with this `project_id` get reset to NULL (back to "Unfiled" personal scope).
    """
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    pid_obj = ObjectId(pid)

    # Cascade-delete project_members.
    ProjectMemberModel.get_collection().delete_many({'project_id': pid_obj})

    # Reset project_id on folders + conversations to NULL.
    mongo.db.folders.update_many(
        {'project_id': pid_obj},
        {'$set': {'project_id': None}}
    )
    mongo.db.conversations.update_many(
        {'project_id': pid_obj},
        {'$set': {'project_id': None}}
    )

    ProjectModel.delete(pid)

    return jsonify({'message': 'Project deleted'}), 200


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@projects_bp.route('/<pid>/members', methods=['GET'])
@jwt_required()
@active_user_required
@project_role(min_role='viewer', id_kwarg='pid')
def list_members(pid: str):
    """List all project members hydrated with user info.

    Workspace owners are NOT auto-injected here — only rows that exist in
    project_members. Project owners can run the page, see the explicit list,
    and add anyone from the parent workspace via POST.
    """
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    rows = ProjectMemberModel.find_by_project(pid) or []

    user_ids = [
        r['user_id'] if isinstance(r.get('user_id'), ObjectId) else ObjectId(r['user_id'])
        for r in rows
        if r.get('user_id') is not None
    ]

    user_map = {}
    if user_ids:
        cursor = UserModel.get_collection().find(
            {'_id': {'$in': user_ids}},
            {'email': 1, 'profile.display_name': 1, 'profile.avatar_url': 1},
        )
        for u in cursor:
            user_map[str(u['_id'])] = {
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
                'avatar_url': (u.get('profile') or {}).get('avatar_url'),
            }

    out = []
    for r in rows:
        row = _serialize(r)
        uid_str = str(r.get('user_id')) if r.get('user_id') is not None else None
        info = user_map.get(uid_str, {}) if uid_str else {}
        row['user'] = {
            'id': uid_str,
            'email': info.get('email'),
            'display_name': info.get('display_name'),
            'avatar_url': info.get('avatar_url'),
        }
        out.append(row)

    return jsonify(out), 200


@projects_bp.route('/<pid>/members', methods=['POST'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def add_member(pid: str):
    """Add a member to a project. Target user must already be a member of
    the project's parent workspace.
    """
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or '').strip()
    role = (data.get('role') or '').strip().lower()

    if not user_id or not validate_object_id(user_id):
        return jsonify({'error': 'Valid user_id is required'}), 400
    if role not in _ALLOWED_MEMBER_ROLES:
        return jsonify({
            'error': f"role must be one of {sorted(_ALLOWED_MEMBER_ROLES)}",
        }), 400

    # Target user must exist.
    target_user = UserModel.get_collection().find_one({'_id': ObjectId(user_id)})
    if not target_user:
        return jsonify({'error': 'User not found'}), 404

    # Target must already be in the parent workspace.
    workspace_id = project.get('workspace_id')
    if not check_workspace_access(user_id, workspace_id, 'viewer'):
        return jsonify({
            'error': 'User is not a member of the parent workspace',
            'code': 'not_in_workspace',
        }), 400

    user = get_current_user()
    member = ProjectMemberModel.add(
        project_id=pid,
        user_id=user_id,
        role=role,
        added_by=user['_id'],
    )

    return jsonify(_serialize(member)), 201


@projects_bp.route('/<pid>/members/<uid>', methods=['PATCH'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def update_member_role(pid: str, uid: str):
    """Change a member's role. Refuses to demote the last explicit owner."""
    if not validate_object_id(pid) or not validate_object_id(uid):
        return jsonify({'error': 'Invalid ID'}), 400

    target = ProjectMemberModel.find(pid, uid)
    if not target:
        return jsonify({'error': 'Member not found'}), 404

    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    if role not in _ALLOWED_MEMBER_ROLES:
        return jsonify({
            'error': f"role must be one of {sorted(_ALLOWED_MEMBER_ROLES)}",
        }), 400

    current_role = target.get('role')
    # Refuse demoting the last explicit owner.
    if current_role == 'owner' and role != 'owner':
        owner_count = _count_explicit_owners(pid)
        if owner_count <= 1:
            return jsonify({
                'error': 'Cannot demote the last owner',
                'code': 'last_owner_protected',
            }), 400

    ProjectMemberModel.update_role(pid, uid, role)
    updated = ProjectMemberModel.find(pid, uid)
    return jsonify(_serialize(updated)), 200


@projects_bp.route('/<pid>/members/<uid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def remove_member(pid: str, uid: str):
    """Remove a member. Refuses if the target is the lone explicit owner."""
    if not validate_object_id(pid) or not validate_object_id(uid):
        return jsonify({'error': 'Invalid ID'}), 400

    target = ProjectMemberModel.find(pid, uid)
    if not target:
        return jsonify({'error': 'Member not found'}), 404

    if target.get('role') == 'owner':
        owner_count = _count_explicit_owners(pid)
        if owner_count <= 1:
            return jsonify({
                'error': 'Cannot remove the last owner',
                'code': 'last_owner_protected',
            }), 400

    ProjectMemberModel.remove(pid, uid)
    return jsonify({'message': 'Member removed'}), 200


# ---------------------------------------------------------------------------
# Decoration: pin / tags
# ---------------------------------------------------------------------------

@projects_bp.route('/<pid>/pin', methods=['PATCH'])
@jwt_required()
@active_user_required
@project_role(min_role='editor', id_kwarg='pid')
def patch_pin(pid: str):
    """Toggle the ``pinned`` flag on a project."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    if 'pinned' not in data or not isinstance(data['pinned'], bool):
        return jsonify({'error': 'pinned (boolean) is required'}), 400

    ProjectModel.pin(pid, data['pinned'])
    return jsonify(_serialize(ProjectModel.find_by_id(pid))), 200


@projects_bp.route('/<pid>/tags', methods=['PATCH'])
@jwt_required()
@active_user_required
@project_role(min_role='editor', id_kwarg='pid')
def patch_tags(pid: str):
    """Replace the tags list for a project."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    tags = data.get('tags')
    if not isinstance(tags, list):
        return jsonify({'error': 'tags must be a list of strings'}), 400
    if not all(isinstance(t, str) for t in tags):
        return jsonify({'error': 'tags must be strings'}), 400
    if len(tags) > 20:
        return jsonify({'error': 'a project may have at most 20 tags'}), 400

    ProjectModel.set_tags(pid, tags)
    return jsonify(_serialize(ProjectModel.find_by_id(pid))), 200


# ---------------------------------------------------------------------------
# Project access (groups + direct members)
# ---------------------------------------------------------------------------

@projects_bp.route('/<pid>/access', methods=['GET'])
@jwt_required()
@active_user_required
@project_role(min_role='viewer', id_kwarg='pid')
def get_access(pid: str):
    """Return ``{groups, direct_members}`` for the project's access page."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    # Group grants — hydrate each with name + color.
    grants = ProjectGroupAccessModel.find_by_project(pid) or []
    groups_out = []
    group_user_ids: dict = {}  # group_id -> set of user_ids in that group
    for g in grants:
        group_doc = GroupModel.find_by_id(g['group_id'])
        if not group_doc:
            continue
        group_id_str = str(g['group_id'])
        members = GroupMemberModel.find_by_group(g['group_id']) or []
        group_user_ids[group_id_str] = {str(m['user_id']) for m in members}
        groups_out.append({
            'group_id': group_id_str,
            'name': group_doc.get('name'),
            'color': group_doc.get('color'),
            'role': g.get('role'),
            'expires_at': g['expires_at'].isoformat() if g.get('expires_at') else None,
        })

    # Direct project members.
    rows = ProjectMemberModel.find_by_project(pid) or []
    user_ids_set = {str(r['user_id']) for r in rows if r.get('user_id') is not None}
    # Combine direct + group members for hydration.
    all_uid_strs = set(user_ids_set)
    for ids in group_user_ids.values():
        all_uid_strs.update(ids)

    user_map = {}
    if all_uid_strs:
        cursor = UserModel.get_collection().find(
            {'_id': {'$in': [ObjectId(x) for x in all_uid_strs]}},
            {'email': 1, 'profile.display_name': 1, 'profile.avatar_url': 1},
        )
        for u in cursor:
            user_map[str(u['_id'])] = {
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
                'avatar_url': (u.get('profile') or {}).get('avatar_url'),
            }

    direct_members = []
    for r in rows:
        uid_str = str(r['user_id']) if r.get('user_id') is not None else None
        info = user_map.get(uid_str, {}) if uid_str else {}
        direct_members.append({
            'user_id': uid_str,
            'name': info.get('display_name'),
            'email': info.get('email'),
            'avatar_url': info.get('avatar_url'),
            'role': r.get('role'),
            'source': 'direct',
        })

    return jsonify({
        'groups': groups_out,
        'direct_members': direct_members,
    }), 200


@projects_bp.route('/<pid>/access/groups', methods=['POST'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def upsert_group_access(pid: str):
    """Add or update a group's access role on a project."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    group_id = (data.get('group_id') or '').strip()
    role = (data.get('role') or '').strip().lower()
    expires_at_raw = data.get('expires_at')

    if not group_id or not validate_object_id(group_id):
        return jsonify({'error': 'Valid group_id is required'}), 400
    if role not in ('viewer', 'editor'):
        return jsonify({
            'error': "role must be 'viewer' or 'editor'",
            'code': 'invalid_role',
        }), 400

    group = GroupModel.find_by_id(group_id)
    if not group:
        return jsonify({'error': 'Group not found'}), 404
    if str(group.get('workspace_id')) != str(project['workspace_id']):
        return jsonify({
            'error': "Group does not belong to this project's workspace",
            'code': 'group_workspace_mismatch',
        }), 400

    expires_at = None
    if expires_at_raw:
        try:
            from datetime import datetime as _dt
            # Accept ISO 8601 with or without seconds.
            expires_at = _dt.fromisoformat(expires_at_raw.replace('Z', '+00:00'))
            # Strip tz to keep parity with model storage (UTC naive).
            if expires_at.tzinfo is not None:
                expires_at = expires_at.replace(tzinfo=None)
        except Exception:
            return jsonify({'error': 'expires_at must be ISO 8601'}), 400

    user = get_current_user()
    row = ProjectGroupAccessModel.set(
        project_id=pid,
        group_id=group_id,
        role=role,
        expires_at=expires_at,
        created_by=user['_id'],
    )
    return jsonify(_serialize(row)), 201


@projects_bp.route('/<pid>/access/groups/<gid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def remove_group_access(pid: str, gid: str):
    if not validate_object_id(pid) or not validate_object_id(gid):
        return jsonify({'error': 'Invalid ID'}), 400

    if not ProjectGroupAccessModel.remove(pid, gid):
        return jsonify({'error': 'Access entry not found'}), 404
    return jsonify({'message': 'Group access removed'}), 200


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

def _serialize_webhook(doc, include_secret=False):
    """Serialize a webhook doc; secret omitted unless explicitly requested."""
    if doc is None:
        return None
    out = _serialize(doc)
    if not include_secret:
        out.pop('secret', None)
    return out


@projects_bp.route('/<pid>/webhooks', methods=['GET'])
@jwt_required()
@active_user_required
@project_role(min_role='viewer', id_kwarg='pid')
def list_webhooks(pid: str):
    """List webhooks for a project. ``secret`` is OMITTED from the response."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    rows = ProjectWebhookModel.find_by_project(pid) or []
    return jsonify([_serialize_webhook(r, include_secret=False) for r in rows]), 200


@projects_bp.route('/<pid>/webhooks', methods=['POST'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def create_webhook(pid: str):
    """Create a webhook. The full doc INCLUDING ``secret`` is returned once."""
    if not validate_object_id(pid):
        return jsonify({'error': 'Invalid project ID'}), 400

    project = ProjectModel.find_by_id(pid)
    if not project:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    url = (data.get('url') or '').strip()
    events = data.get('events')

    if not name:
        return jsonify({'error': 'name is required'}), 400
    if not url:
        return jsonify({'error': 'url is required'}), 400
    if events is not None and not isinstance(events, list):
        return jsonify({'error': 'events must be a list of strings'}), 400

    user = get_current_user()
    webhook = ProjectWebhookModel.create(
        project_id=pid,
        name=name,
        url=url,
        events=events,
        created_by=user['_id'],
    )

    return jsonify(_serialize_webhook(webhook, include_secret=True)), 201


@projects_bp.route('/<pid>/webhooks/<whid>', methods=['PUT'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def update_webhook(pid: str, whid: str):
    """Update a webhook (name, url, events, enabled). Secret unaffected."""
    if not validate_object_id(pid) or not validate_object_id(whid):
        return jsonify({'error': 'Invalid ID'}), 400

    webhook = ProjectWebhookModel.find_by_id(whid)
    if not webhook or str(webhook.get('project_id')) != str(pid):
        return jsonify({'error': 'Webhook not found'}), 404

    data = request.get_json(silent=True) or {}
    update_data = {}
    for field in ('name', 'url', 'events', 'enabled'):
        if field in data:
            update_data[field] = data[field]

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        ProjectWebhookModel.update(whid, update_data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    updated = ProjectWebhookModel.find_by_id(whid)
    return jsonify(_serialize_webhook(updated, include_secret=False)), 200


@projects_bp.route('/<pid>/webhooks/<whid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def delete_webhook(pid: str, whid: str):
    """Hard-delete a webhook."""
    if not validate_object_id(pid) or not validate_object_id(whid):
        return jsonify({'error': 'Invalid ID'}), 400

    webhook = ProjectWebhookModel.find_by_id(whid)
    if not webhook or str(webhook.get('project_id')) != str(pid):
        return jsonify({'error': 'Webhook not found'}), 404

    ProjectWebhookModel.delete(whid)
    return jsonify({'message': 'Webhook deleted'}), 200


@projects_bp.route('/<pid>/webhooks/<whid>/rotate-secret', methods=['POST'])
@jwt_required()
@active_user_required
@project_role(min_role='owner', id_kwarg='pid')
def rotate_webhook_secret(pid: str, whid: str):
    """Rotate the webhook secret. Returns the new value once."""
    if not validate_object_id(pid) or not validate_object_id(whid):
        return jsonify({'error': 'Invalid ID'}), 400

    webhook = ProjectWebhookModel.find_by_id(whid)
    if not webhook or str(webhook.get('project_id')) != str(pid):
        return jsonify({'error': 'Webhook not found'}), 404

    new_secret = ProjectWebhookModel.rotate_secret(whid)
    return jsonify({'secret': new_secret}), 200
