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
from app.models.project import ProjectModel
from app.models.project_member import ProjectMemberModel
from app.models.user import UserModel
from app.models.workspace import WorkspaceModel
from app.utils.decorators import active_user_required, project_role
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import check_workspace_access, get_project_role

projects_bp = Blueprint('projects', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_MEMBER_ROLES = {'viewer', 'editor', 'owner'}
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

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    ProjectModel.update(pid, update_data)
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
