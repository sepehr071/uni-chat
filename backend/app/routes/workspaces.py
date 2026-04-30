"""
Workspaces API blueprint.

Endpoints (all protected by JWT + active_user_required):
    GET    /list                      List workspaces the caller is a member of
    POST   /create                    Create a new team workspace
    GET    /<wid>                     Get one workspace + caller role
    PATCH  /<wid>                     Update workspace (owner only)
    DELETE /<wid>                     Delete team workspace (owner only;
                                       personal workspaces cannot be deleted)
    POST   /<wid>/invites             Create invite (owner only)
    GET    /<wid>/invites             List pending invites (owner only)
    DELETE /<wid>/invites/<token>     Revoke invite (owner only)
    POST   /accept-invite             Accept invite by token
    GET    /<wid>/members             List workspace members
    PATCH  /<wid>/members/<uid>       Change a member's role (owner only)
    DELETE /<wid>/members/<uid>       Remove a member (owner only or self-leave)

All routes use named sub-paths (never bare '/') per CLAUDE.md known issue.
"""

from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required

from app.models.user import UserModel
from app.models.workspace import WorkspaceModel
from app.models.workspace_invite import WorkspaceInviteModel
from app.models.workspace_member import ROLE_HIERARCHY, WorkspaceMemberModel
from app.utils.decorators import active_user_required, workspace_member
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import get_workspace_role

workspaces_bp = Blueprint('workspaces', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_INVITE_ROLES = {'viewer', 'editor'}
_ALLOWED_MEMBER_ROLES = {'viewer', 'editor', 'owner'}


def _serialize(doc):
    """Recursively stringify ObjectIds + ISO datetimes."""
    return serialize_doc(doc)


def _current_user_id_str() -> str:
    user = get_current_user()
    return str(user['_id'])


def _normalize_email(email: str) -> str:
    return (email or '').strip().lower()


# ---------------------------------------------------------------------------
# Workspace CRUD
# ---------------------------------------------------------------------------

@workspaces_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
def list_workspaces():
    """List all workspaces the caller is an active member of."""
    user = get_current_user()
    user_id_str = str(user['_id'])

    workspaces = WorkspaceModel.find_by_member(user_id_str) or []

    out = []
    for ws in workspaces:
        ws_id_str = str(ws['_id'])
        role = get_workspace_role(user_id_str, ws_id_str)
        ws_dict = _serialize(ws)
        ws_dict['member_role'] = role
        out.append(ws_dict)

    return jsonify(out), 200


@workspaces_bp.route('/create', methods=['POST'])
@jwt_required()
@active_user_required
def create_workspace():
    """Create a new team workspace. The caller becomes the owner."""
    user = get_current_user()
    user_id = user['_id']
    data = request.get_json(silent=True) or {}

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    if len(name) > 100:
        return jsonify({'error': 'name must be at most 100 characters'}), 400

    avatar = data.get('avatar')
    settings = data.get('settings') if isinstance(data.get('settings'), dict) else None

    ws = WorkspaceModel.create(
        name=name,
        owner_id=user_id,
        type='team',
        avatar=avatar,
        settings=settings,
    )
    WorkspaceMemberModel.add(
        ws['_id'],
        user_id,
        'owner',
        invited_by=user_id,
        status='active',
    )

    return jsonify(_serialize(ws)), 201


@workspaces_bp.route('/<wid>', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='viewer', id_kwarg='wid')
def get_workspace(wid: str):
    """Return workspace doc + caller's role."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    user_id_str = _current_user_id_str()
    role = get_workspace_role(user_id_str, wid)

    out = _serialize(ws)
    out['member_role'] = role
    return jsonify(out), 200


@workspaces_bp.route('/<wid>', methods=['PATCH'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def update_workspace(wid: str):
    """Update workspace name / avatar / settings (owner only).

    Personal workspaces can be renamed (display name only) but their slug is
    never regenerated, so no slug-clash check is needed here.
    """
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    data = request.get_json(silent=True) or {}
    update_data = {}

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        if len(name) > 100:
            return jsonify({'error': 'name must be at most 100 characters'}), 400
        update_data['name'] = name

    if 'avatar' in data:
        update_data['avatar'] = data['avatar']

    if 'settings' in data:
        if not isinstance(data['settings'], dict):
            return jsonify({'error': 'settings must be an object'}), 400
        update_data['settings'] = data['settings']

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    WorkspaceModel.update(wid, update_data)
    updated = WorkspaceModel.find_by_id(wid)
    return jsonify(_serialize(updated)), 200


@workspaces_bp.route('/<wid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def delete_workspace(wid: str):
    """Delete a team workspace (owner only).

    Personal workspaces cannot be deleted. Cascades:
        * workspace_members rows for this workspace
        * workspace_invites rows for this workspace

    Resources (conversations, etc.) keep their NULL project_id and remain
    in their owners' personal scope.
    """
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    if ws.get('type') == 'personal':
        return jsonify({
            'error': 'Personal workspaces cannot be deleted',
            'code': 'personal_workspace_immutable',
        }), 403

    wid_obj = ObjectId(wid)

    # Cascade-delete members + invites first.
    WorkspaceMemberModel.get_collection().delete_many({'workspace_id': wid_obj})
    WorkspaceInviteModel.get_collection().delete_many({'workspace_id': wid_obj})

    WorkspaceModel.delete(wid)

    # Reset active_workspace_id for any user pointing at this workspace —
    # they'll be auto-routed to their personal workspace on next request.
    UserModel.get_collection().update_many(
        {'active_workspace_id': wid_obj},
        {'$set': {'active_workspace_id': None, 'updated_at': datetime.utcnow()}}
    )

    return jsonify({'message': 'Workspace deleted'}), 200


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/invites', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def create_invite(wid: str):
    """Create an invite for a given email + role. Returns token + invite_url."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    user = get_current_user()
    data = request.get_json(silent=True) or {}

    email = _normalize_email(data.get('email', ''))
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email is required'}), 400

    role = (data.get('role') or '').strip().lower()
    if role not in _ALLOWED_INVITE_ROLES:
        return jsonify({
            'error': f"role must be one of {sorted(_ALLOWED_INVITE_ROLES)}",
        }), 400

    invite = WorkspaceInviteModel.create(
        workspace_id=wid,
        email=email,
        role=role,
        invited_by=user['_id'],
    )

    out = _serialize(invite)
    out['invite_url'] = f"/invite/{invite['token']}"
    return jsonify(out), 201


@workspaces_bp.route('/<wid>/invites', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def list_invites(wid: str):
    """List pending invites for this workspace."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    invites = WorkspaceInviteModel.find_by_workspace(wid, pending_only=True) or []
    return jsonify([_serialize(i) for i in invites]), 200


@workspaces_bp.route('/<wid>/invites/<token>', methods=['DELETE'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def revoke_invite(wid: str, token: str):
    """Revoke an invite by token."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    invite = WorkspaceInviteModel.find_by_token(token)
    if not invite:
        return jsonify({'error': 'Invite not found'}), 404
    if str(invite.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Invite does not belong to this workspace'}), 404

    WorkspaceInviteModel.revoke(token)
    return jsonify({'message': 'Invite revoked'}), 200


@workspaces_bp.route('/accept-invite', methods=['POST'])
@jwt_required()
@active_user_required
def accept_invite():
    """Accept an invite by token. Adds caller to workspace_members."""
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'token is required'}), 400

    invite = WorkspaceInviteModel.find_by_token(token)
    if not invite:
        return jsonify({'error': 'Invite not found', 'code': 'invite_not_found'}), 404

    if invite.get('accepted_at') is not None:
        return jsonify({
            'error': 'Invite has already been accepted',
            'code': 'invite_already_accepted',
        }), 400

    expires_at = invite.get('expires_at')
    if expires_at and isinstance(expires_at, datetime) and expires_at <= datetime.utcnow():
        return jsonify({'error': 'Invite has expired', 'code': 'invite_expired'}), 400

    invite_email = _normalize_email(invite.get('email', ''))
    user_email = _normalize_email(user.get('email', ''))
    if invite_email != user_email:
        return jsonify({'error': 'invite_email_mismatch'}), 403

    role = invite.get('role', 'viewer')
    if role not in _ALLOWED_MEMBER_ROLES:
        role = 'viewer'

    workspace_id = invite['workspace_id']

    # If the user is already a member, ensure they are active. Otherwise
    # insert a fresh active membership.
    existing = WorkspaceMemberModel.find(workspace_id, user['_id'])
    if existing:
        if existing.get('status') != 'active':
            WorkspaceMemberModel.update_status(workspace_id, user['_id'], 'active')
    else:
        WorkspaceMemberModel.add(
            workspace_id,
            user['_id'],
            role,
            invited_by=invite.get('invited_by'),
            status='active',
        )

    WorkspaceInviteModel.mark_accepted(token)

    return jsonify({
        'workspace_id': str(workspace_id),
        'role': role,
    }), 200


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/members', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='viewer', id_kwarg='wid')
def list_members(wid: str):
    """List active + pending members, hydrated with user info."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    active = WorkspaceMemberModel.find_by_workspace(wid, status='active') or []
    pending = WorkspaceMemberModel.find_by_workspace(wid, status='pending') or []
    rows = list(active) + list(pending)

    # Batch-hydrate user info.
    user_ids = []
    for r in rows:
        uid = r.get('user_id')
        if uid is not None:
            user_ids.append(uid if isinstance(uid, ObjectId) else ObjectId(uid))

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


@workspaces_bp.route('/<wid>/members/<uid>', methods=['PATCH'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def update_member_role(wid: str, uid: str):
    """Change a member's role. Refuses to demote the last owner."""
    if not validate_object_id(wid) or not validate_object_id(uid):
        return jsonify({'error': 'Invalid ID'}), 400

    data = request.get_json(silent=True) or {}
    role = (data.get('role') or '').strip().lower()
    if role not in _ALLOWED_MEMBER_ROLES:
        return jsonify({
            'error': f"role must be one of {sorted(_ALLOWED_MEMBER_ROLES)}",
        }), 400

    target = WorkspaceMemberModel.find(wid, uid)
    if not target:
        return jsonify({'error': 'Member not found'}), 404

    current_role = target.get('role')
    # Refuse demoting the last owner.
    if current_role == 'owner' and role != 'owner':
        owner_count = WorkspaceMemberModel.count_owners(wid)
        if owner_count <= 1:
            return jsonify({
                'error': 'Cannot demote the last owner',
                'code': 'last_owner_protected',
            }), 400

    WorkspaceMemberModel.update_role(wid, uid, role)
    updated = WorkspaceMemberModel.find(wid, uid)
    return jsonify(_serialize(updated)), 200


@workspaces_bp.route('/<wid>/members/<uid>', methods=['DELETE'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def remove_member(wid: str, uid: str):
    """Remove a member. Self-leave is permitted unless caller is last owner."""
    if not validate_object_id(wid) or not validate_object_id(uid):
        return jsonify({'error': 'Invalid ID'}), 400

    target = WorkspaceMemberModel.find(wid, uid)
    if not target:
        return jsonify({'error': 'Member not found'}), 404

    if target.get('role') == 'owner':
        owner_count = WorkspaceMemberModel.count_owners(wid)
        if owner_count <= 1:
            return jsonify({
                'error': 'Cannot remove the last owner',
                'code': 'last_owner_protected',
            }), 400

    WorkspaceMemberModel.remove(wid, uid)

    # If the removed user had this workspace active, reset to None.
    UserModel.get_collection().update_one(
        {'_id': ObjectId(uid), 'active_workspace_id': ObjectId(wid)},
        {'$set': {'active_workspace_id': None, 'updated_at': datetime.utcnow()}}
    )

    return jsonify({'message': 'Member removed'}), 200
