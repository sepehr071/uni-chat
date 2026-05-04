"""Groups API blueprint.

Mounted at ``/api/workspaces/<wid>/groups``. All routes JWT-protected and
gated by workspace membership.

    POST   /api/workspaces/<wid>/groups                 Create a group        (admin+)
    GET    /api/workspaces/<wid>/groups/list            List groups            (viewer+)
    GET    /api/workspaces/<wid>/groups/<gid>           Group detail + members (viewer+)
    PUT    /api/workspaces/<wid>/groups/<gid>           Update group           (admin+)
    DELETE /api/workspaces/<wid>/groups/<gid>           Delete + cascade       (admin+)
    POST   /api/workspaces/<wid>/groups/<gid>/members   Add member             (admin+)
    DELETE /api/workspaces/<wid>/groups/<gid>/members/<uid>  Remove member     (admin+)

Uses named subpaths only (avoids the trailing-slash JWT bug noted in CLAUDE.md).
"""

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required
from pymongo.errors import DuplicateKeyError

from app.models.group import GroupModel
from app.models.group_member import GroupMemberModel
from app.models.project_group_access import ProjectGroupAccessModel
from app.models.user import UserModel
from app.utils.decorators import active_user_required, workspace_member
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import check_workspace_access

groups_bp = Blueprint('groups', __name__)


def _serialize(doc):
    return serialize_doc(doc)


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------

@groups_bp.route('/<wid>/groups', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='admin', id_kwarg='wid')
def create_group(wid: str):
    """Create a new group within the workspace."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    user = get_current_user()
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > 80:
        return jsonify({'error': 'name must be at most 80 characters'}), 400

    color = data.get('color') or '#5c9aed'
    icon = data.get('icon')
    description = data.get('description')

    try:
        doc = GroupModel.create(
            workspace_id=wid,
            name=name,
            created_by=user['_id'],
            color=color,
            icon=icon,
            description=description,
        )
    except DuplicateKeyError:
        return jsonify({
            'error': 'A group with that name already exists in this workspace',
            'code': 'group_name_exists',
        }), 409

    return jsonify(_serialize(doc)), 201


@groups_bp.route('/<wid>/groups/list', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='viewer', id_kwarg='wid')
def list_groups(wid: str):
    """List all groups in a workspace."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400
    groups = GroupModel.find_by_workspace(wid) or []
    return jsonify({'groups': [_serialize(g) for g in groups]}), 200


@groups_bp.route('/<wid>/groups/<gid>', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='viewer', id_kwarg='wid')
def get_group(wid: str, gid: str):
    """Group detail + hydrated member list."""
    if not validate_object_id(wid) or not validate_object_id(gid):
        return jsonify({'error': 'Invalid ID'}), 400

    group = GroupModel.find_by_id(gid)
    if not group or str(group.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Group not found'}), 404

    rows = GroupMemberModel.find_by_group(gid) or []
    user_ids = [
        r['user_id'] if isinstance(r.get('user_id'), ObjectId) else ObjectId(r['user_id'])
        for r in rows if r.get('user_id') is not None
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

    members = []
    for r in rows:
        uid_str = str(r['user_id']) if r.get('user_id') is not None else None
        info = user_map.get(uid_str, {}) if uid_str else {}
        row = _serialize(r)
        row['user'] = {
            'id': uid_str,
            'email': info.get('email'),
            'display_name': info.get('display_name'),
            'avatar_url': info.get('avatar_url'),
        }
        members.append(row)

    out = _serialize(group)
    out['members'] = members
    return jsonify(out), 200


@groups_bp.route('/<wid>/groups/<gid>', methods=['PUT'])
@jwt_required()
@active_user_required
@workspace_member(min_role='admin', id_kwarg='wid')
def update_group(wid: str, gid: str):
    """Whitelisted update — name / color / icon / description."""
    if not validate_object_id(wid) or not validate_object_id(gid):
        return jsonify({'error': 'Invalid ID'}), 400

    group = GroupModel.find_by_id(gid)
    if not group or str(group.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Group not found'}), 404

    data = request.get_json(silent=True) or {}
    update_data = {}
    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        if len(name) > 80:
            return jsonify({'error': 'name must be at most 80 characters'}), 400
        update_data['name'] = name
    if 'color' in data:
        update_data['color'] = data['color']
    if 'icon' in data:
        update_data['icon'] = data['icon']
    if 'description' in data:
        update_data['description'] = data['description']

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        GroupModel.update(gid, update_data)
    except DuplicateKeyError:
        return jsonify({
            'error': 'A group with that name already exists in this workspace',
            'code': 'group_name_exists',
        }), 409
    return jsonify(_serialize(GroupModel.find_by_id(gid))), 200


@groups_bp.route('/<wid>/groups/<gid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@workspace_member(min_role='admin', id_kwarg='wid')
def delete_group(wid: str, gid: str):
    """Hard-delete + cascade (group_members + project_group_access)."""
    if not validate_object_id(wid) or not validate_object_id(gid):
        return jsonify({'error': 'Invalid ID'}), 400

    group = GroupModel.find_by_id(gid)
    if not group or str(group.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Group not found'}), 404

    gid_obj = ObjectId(gid)
    GroupMemberModel.get_collection().delete_many({'group_id': gid_obj})
    ProjectGroupAccessModel.get_collection().delete_many({'group_id': gid_obj})
    GroupModel.delete(gid)
    return jsonify({'message': 'Group deleted'}), 200


# ---------------------------------------------------------------------------
# Group membership
# ---------------------------------------------------------------------------

@groups_bp.route('/<wid>/groups/<gid>/members', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='admin', id_kwarg='wid')
def add_member(wid: str, gid: str):
    """Add a workspace user to a group. Recomputes ``member_count``."""
    if not validate_object_id(wid) or not validate_object_id(gid):
        return jsonify({'error': 'Invalid ID'}), 400

    group = GroupModel.find_by_id(gid)
    if not group or str(group.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Group not found'}), 404

    data = request.get_json(silent=True) or {}
    user_id = (data.get('user_id') or '').strip()
    if not user_id or not validate_object_id(user_id):
        return jsonify({'error': 'Valid user_id is required'}), 400

    target_user = UserModel.get_collection().find_one({'_id': ObjectId(user_id)})
    if not target_user:
        return jsonify({'error': 'User not found'}), 404

    # Target must be a workspace member.
    if not check_workspace_access(user_id, wid, 'viewer'):
        return jsonify({
            'error': 'User is not a member of the parent workspace',
            'code': 'not_in_workspace',
        }), 400

    user = get_current_user()
    member = GroupMemberModel.add(gid, user_id, added_by=user['_id'])
    GroupModel.recompute_member_count(gid)
    return jsonify(_serialize(member)), 201


@groups_bp.route('/<wid>/groups/<gid>/members/<uid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@workspace_member(min_role='admin', id_kwarg='wid')
def remove_member(wid: str, gid: str, uid: str):
    if not validate_object_id(wid) or not validate_object_id(gid) or not validate_object_id(uid):
        return jsonify({'error': 'Invalid ID'}), 400

    group = GroupModel.find_by_id(gid)
    if not group or str(group.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Group not found'}), 404

    if not GroupMemberModel.is_member(gid, uid):
        return jsonify({'error': 'Member not found'}), 404

    GroupMemberModel.remove(gid, uid)
    GroupModel.recompute_member_count(gid)
    return jsonify({'message': 'Member removed'}), 200
