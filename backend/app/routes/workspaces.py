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

import logging
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, jwt_required

logger = logging.getLogger(__name__)

from app.models.audit_log import AuditLogModel
from app.models.credit_ledger import CreditLedgerModel
from app.models.group import GroupModel
from app.models.project import ProjectModel
from app.models.usage_log import UsageLogModel
from app.models.user import UserModel
from app.models.workspace import WorkspaceModel
from app.models.workspace_invite import WorkspaceInviteModel
from app.models.workspace_member import ROLE_HIERARCHY, WorkspaceMemberModel
from app.utils.decorators import active_user_required, manager_or_admin_required, workspace_member
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.permissions import get_workspace_role

workspaces_bp = Blueprint('workspaces', __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_INVITE_ROLES = {'viewer', 'editor', 'owner'}
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
@manager_or_admin_required
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

    # Policy / plan fields — surface to model, which validates further.
    for field in ('ip_allowlist', 'enforce_2fa', 'plan_tier'):
        if field in data:
            update_data[field] = data[field]

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        WorkspaceModel.update(wid, update_data)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
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

    # Full cascade across every workspace-scoped collection (P0.5).
    from app.services.workspace_cascade import cascade_delete
    cascade_counts = cascade_delete(wid_obj)

    # Reset active_workspace_id for any user pointing at this workspace —
    # they'll be auto-routed to their personal workspace on next request.
    UserModel.get_collection().update_many(
        {'active_workspace_id': wid_obj},
        {'$set': {'active_workspace_id': None, 'updated_at': datetime.utcnow()}}
    )

    # Audit-log the cascade rollup so CEO/platform dashboards can see what
    # disappeared and when.
    try:
        from app.models.audit_log import AuditLogModel
        AuditLogModel.create(
            action='workspace_deleted',
            admin_id=get_current_user()['_id'],
            target_type='workspace',
            target_id=wid,
            details={'cascade_counts': cascade_counts},
        )
    except Exception:
        pass  # audit failures must not break the delete response

    return jsonify({'message': 'Workspace deleted', 'cascade': cascade_counts}), 200


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/invites', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def create_invite(wid: str):
    """Create an invite for a given email + role. Returns token + invite_url + email_sent."""
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

    ws = WorkspaceModel.find_by_id(wid)
    accept_url = f"/invite/{invite['token']}"
    inviter_name = (user.get('profile') or {}).get('display_name') or user.get('email', '')
    from app.services.email_service import send_invite_email
    email_sent = send_invite_email(
        to=email,
        workspace_name=ws.get('name', '') if ws else '',
        accept_url=accept_url,
        inviter_name=inviter_name,
        role=role,
    )

    out = _serialize(invite)
    out['invite_url'] = accept_url
    out['email_sent'] = email_sent
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
    """Accept an invite by token. Adds caller to workspace_members.

    P0.9: mirror the cross-collection email guard from /auth/register so a
    platform-admin email can never silently become a regular workspace
    member. Without this guard a workspace owner who happens to invite a
    platform-admin's email creates a row that get_current_user() can't
    resolve (the JWT identity is in `platform_admins`, not `users`),
    yielding 500s in every downstream route.
    """
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

    # Cross-collection guard: refuse if invite email belongs to a
    # platform admin (P0.9). Platform admins have no users row, so even
    # if their JWT somehow passed active_user_required (it does not today)
    # we still want a hard refusal at the model boundary.
    try:
        from app.models.platform_admin import PlatformAdminModel
        if PlatformAdminModel.find_by_email(invite_email):
            return jsonify({
                'error': 'This email is reserved for platform administration',
                'code': 'platform_admin_email',
            }), 403
    except ImportError:
        pass

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


@workspaces_bp.route('/<wid>/transfer-ownership', methods=['POST'])
@jwt_required()
@active_user_required
def transfer_ownership(wid: str):
    """Transfer workspace ownership to another active member.

    Auth: caller must be current workspace owner OR have global role 'admin'.
    Body: { new_owner_user_id: str }
    """
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    user = get_current_user()
    caller_id_str = str(user['_id'])

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    caller_membership = WorkspaceMemberModel.find(wid, caller_id_str)
    is_owner = caller_membership and caller_membership.get('role') == 'owner' and caller_membership.get('status') == 'active'
    is_global_admin = user.get('role') == 'admin'

    if not is_owner and not is_global_admin:
        return jsonify({'error': 'Only the workspace owner or a global admin may transfer ownership'}), 403

    data = request.get_json(silent=True) or {}
    new_owner_uid = (data.get('new_owner_user_id') or '').strip()
    if not new_owner_uid or not validate_object_id(new_owner_uid):
        return jsonify({'error': 'Valid new_owner_user_id is required'}), 400

    if new_owner_uid == caller_id_str:
        return jsonify({'error': 'Target is already the caller'}), 409

    target_membership = WorkspaceMemberModel.find(wid, new_owner_uid)
    if not target_membership or target_membership.get('status') != 'active':
        return jsonify({'error': 'Target user is not an active member of this workspace'}), 400

    if target_membership.get('role') == 'owner':
        return jsonify({'error': 'Target is already an owner'}), 409

    # Atomic three-step swap (P0.8): demote caller, promote target, swap
    # workspace.owner. Try with_transaction first — on replica-set Mongo
    # (Atlas + prod) a failure inside the lambda triggers a real driver-level
    # abort. On standalone Mongo (local dev / CI) the lambda still runs but
    # without atomicity, so a mid-flight failure leaves partial writes on
    # disk. We therefore ALWAYS run a manual rollback on any exception path,
    # restoring the captured pre-swap state. On replica-set Mongo the rollback
    # is a redundant no-op (the writes were aborted); on standalone Mongo it
    # repairs the partial state.
    from app.extensions import mongo as _mongo

    previous_owner_role = caller_membership.get('role') if caller_membership else None
    previous_target_role = target_membership.get('role')
    previous_workspace_owner = ws.get('owner_id')

    def _do_swap():
        if caller_membership:
            WorkspaceMemberModel.update_role(wid, caller_id_str, 'editor')
        WorkspaceMemberModel.update_role(wid, new_owner_uid, 'owner')
        WorkspaceModel.set_owner(wid, new_owner_uid)

    def _manual_rollback():
        try:
            if caller_membership and previous_owner_role:
                WorkspaceMemberModel.update_role(wid, caller_id_str, previous_owner_role)
        except Exception as exc:
            logger.error('transfer_ownership rollback: caller demote-undo failed: %s', exc)
        try:
            if previous_target_role:
                WorkspaceMemberModel.update_role(wid, new_owner_uid, previous_target_role)
        except Exception as exc:
            logger.error('transfer_ownership rollback: target promote-undo failed: %s', exc)
        try:
            if previous_workspace_owner is not None:
                WorkspaceModel.set_owner(wid, str(previous_workspace_owner))
        except Exception as exc:
            logger.error('transfer_ownership rollback: owner-pointer undo failed: %s', exc)

    try:
        client = _mongo.cx
        with client.start_session() as session:
            session.with_transaction(lambda s: _do_swap())
    except Exception as txn_exc:
        logger.warning(
            'transfer_ownership swap failed (%s); rolling back',
            txn_exc,
        )
        _manual_rollback()
        return jsonify({
            'error': 'Ownership transfer failed; state restored',
        }), 500

    AuditLogModel.create(
        action='workspace.transfer_ownership',
        admin_id=user['_id'],
        target_id=wid,
        target_type='workspace',
        details={
            'workspace_id': wid,
            'previous_owner_id': caller_id_str,
            'new_owner_id': new_owner_uid,
        },
    )

    updated_ws = WorkspaceModel.find_by_id(wid)
    caller_row = WorkspaceMemberModel.find(wid, caller_id_str)
    target_row = WorkspaceMemberModel.find(wid, new_owner_uid)

    return jsonify({
        'workspace': _serialize(updated_ws),
        'previous_owner_membership': _serialize(caller_row) if caller_row else None,
        'new_owner_membership': _serialize(target_row),
    }), 200


@workspaces_bp.route('/<wid>/invites/<token>/resend', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def resend_invite(wid: str, token: str):
    """Rotate invite token, reset expiry, and optionally re-send email."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    invite = WorkspaceInviteModel.find_by_token(token)
    if not invite or str(invite.get('workspace_id')) != str(wid):
        return jsonify({'error': 'Invite not found'}), 404

    if invite.get('accepted_at') is not None:
        return jsonify({'error': 'Invite has already been accepted', 'code': 'invite_already_accepted'}), 409

    updated_invite = WorkspaceInviteModel.refresh(token)
    if not updated_invite:
        return jsonify({'error': 'Failed to refresh invite'}), 500

    ws = WorkspaceModel.find_by_id(wid)
    user = get_current_user()
    accept_url = f"/invite/{updated_invite['token']}"
    inviter_name = (user.get('profile') or {}).get('display_name') or user.get('email', '')
    from app.services.email_service import send_invite_email
    email_sent = send_invite_email(
        to=updated_invite.get('email', ''),
        workspace_name=ws.get('name', '') if ws else '',
        accept_url=accept_url,
        inviter_name=inviter_name,
        role=updated_invite.get('role', 'viewer'),
    )

    out = _serialize(updated_invite)
    out['invite_url'] = accept_url
    out['email_sent'] = email_sent
    return jsonify({'invite': out, 'accept_url': accept_url, 'email_sent': email_sent}), 200


# ---------------------------------------------------------------------------
# Overview + billing helpers
# ---------------------------------------------------------------------------

def _month_start_utc():
    now = datetime.utcnow()
    return datetime(now.year, now.month, 1)


def _parse_iso_date(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    # Try ISO 8601 with microseconds / timezone first.
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if parsed.tzinfo is not None:
                parsed = parsed.replace(tzinfo=None)
            return parsed
        except ValueError:
            pass
    for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(value, fmt)
        except (TypeError, ValueError):
            continue
    return None


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/overview', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='viewer', id_kwarg='wid')
def workspace_overview(wid: str):
    """Aggregate dashboard data for the workspace overview page."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    wid_obj = ObjectId(wid)
    month_start = _month_start_utc()

    # Billing block.
    spend_mtd = UsageLogModel.aggregate_workspace_spend(wid, start=month_start)
    seats_used = WorkspaceMemberModel.get_collection().count_documents({
        'workspace_id': wid_obj,
        'status': 'active',
    })
    billing = {
        'plan_tier': ws.get('plan_tier') or ws.get('plan') or 'free',
        'credits_balance_usd': float(ws.get('credits_balance_usd') or 0),
        'spend_mtd_usd': float(spend_mtd or 0),
        'seats_used': seats_used,
        'seats_total': int(ws.get('seats_total') or 0),
        'budget_mtd_usd': float(ws.get('budget_mtd_usd') or 0),
        'renews_at': ws['renews_at'].isoformat() if isinstance(ws.get('renews_at'), datetime) else ws.get('renews_at'),
        'sso_enforced': bool(ws.get('sso_enforced')),
        'scim_enabled': bool(ws.get('scim_enabled')),
        'domain': ws.get('domain'),
    }

    # Top projects by spend MTD (limit 5).
    project_rows = UsageLogModel.aggregate_project_spend(wid, start=month_start)[:5]
    pid_objs = [ObjectId(r['project_id']) for r in project_rows if r.get('project_id')]
    project_map = {}
    if pid_objs:
        cursor = ProjectModel.get_collection().find({'_id': {'$in': pid_objs}})
        for p in cursor:
            project_map[str(p['_id'])] = p
    top_projects = []
    for r in project_rows:
        pid = r.get('project_id')
        proj = project_map.get(pid) if pid else None
        if not proj:
            continue
        top_projects.append({
            'project_id': pid,
            'name': proj.get('name'),
            'color': proj.get('color'),
            'pinned': bool(proj.get('pinned')),
            'total_cost': r.get('total_cost', 0),
            'message_count': r.get('count', 0),
        })

    # Recent activity from audit_log scoped to the workspace.
    activity_cursor = AuditLogModel.get_collection().find({
        '$or': [
            {'details.workspace_id': str(wid_obj)},
            {'details.workspace_id': wid_obj},
            {'target_id': wid_obj, 'target_type': 'workspace'},
        ]
    }).sort('created_at', -1).limit(5)
    recent_activity = [serialize_doc(a) for a in activity_cursor]

    # Top groups (alphabetical, capped 5).
    groups_cursor = GroupModel.find_by_workspace(wid)[:5]
    groups_out = [serialize_doc(g) for g in groups_cursor]

    # Daily 30-day usage.
    daily = UsageLogModel.aggregate_daily(wid, days=30)

    # Stats summary.
    messages_mtd = UsageLogModel.total_messages_this_month(wid)
    active_projects = ProjectModel.count_by_workspace(wid, archived=False)
    members_active = seats_used

    return jsonify({
        'workspace': serialize_doc(ws),
        'billing': billing,
        'top_projects': top_projects,
        'recent_activity': recent_activity,
        'groups': groups_out,
        'usage_30d': daily,
        'stats': {
            'messages_mtd': messages_mtd,
            'active_projects': active_projects,
            'members_active': members_active,
        },
    }), 200


# ---------------------------------------------------------------------------
# Billing — usage aggregation
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/billing/usage', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def billing_usage(wid: str):
    """Multi-axis spend aggregation for the billing tab.

    Query params: ``start``, ``end`` (ISO date / datetime). Default window is
    the start of the current calendar month → now.
    """
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    start = _parse_iso_date(request.args.get('start')) or _month_start_utc()
    end = _parse_iso_date(request.args.get('end')) or datetime.utcnow()

    by_user = UsageLogModel.aggregate_user_spend(wid, start=start, end=end)
    by_project = UsageLogModel.aggregate_project_spend(wid, start=start, end=end)
    by_model = UsageLogModel.aggregate_model_spend(wid, start=start, end=end)

    daily_cursor = UsageLogModel.get_collection().aggregate([
        {'$match': {
            'workspace_id': ObjectId(wid),
            'created_at': {'$gte': start, '$lte': end},
        }},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}},
            'cost_usd': {'$sum': '$cost_usd'},
            'total_tokens': {'$sum': {'$add': [
                {'$ifNull': ['$prompt_tokens', 0]},
                {'$ifNull': ['$completion_tokens', 0]},
            ]}},
            'messages': {'$sum': 1},
        }},
        {'$sort': {'_id': 1}},
    ])
    daily = [
        {
            'date': r['_id'],
            'cost_usd': r['cost_usd'],
            'total_tokens': r['total_tokens'],
            'messages': r['messages'],
        }
        for r in daily_cursor
    ]

    totals = {
        'cost_usd': float(sum(r.get('total_cost', 0) for r in by_user)),
        'total_tokens': int(sum(r.get('total_tokens', 0) for r in by_user)),
        'messages': int(sum(r.get('count', 0) for r in by_user)),
    }

    # Hydrate user names for by_user.
    uid_objs = [ObjectId(r['user_id']) for r in by_user if r.get('user_id')]
    user_map = {}
    if uid_objs:
        cursor = UserModel.get_collection().find(
            {'_id': {'$in': uid_objs}},
            {'email': 1, 'profile.display_name': 1, 'profile.avatar_url': 1},
        )
        for u in cursor:
            user_map[str(u['_id'])] = {
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
                'avatar_url': (u.get('profile') or {}).get('avatar_url'),
            }
    for row in by_user:
        info = user_map.get(row.get('user_id') or '', {})
        row['email'] = info.get('email')
        row['display_name'] = info.get('display_name')
        row['avatar_url'] = info.get('avatar_url')

    # Hydrate project names for by_project.
    pid_objs = [ObjectId(r['project_id']) for r in by_project if r.get('project_id')]
    project_map = {}
    if pid_objs:
        cursor = ProjectModel.get_collection().find({'_id': {'$in': pid_objs}})
        for p in cursor:
            project_map[str(p['_id'])] = p
    for row in by_project:
        proj = project_map.get(row.get('project_id') or '')
        if proj:
            row['name'] = proj.get('name')
            row['color'] = proj.get('color')

    lifetime_topups = float(CreditLedgerModel.sum_credits(wid))
    lifetime_spend = float(UsageLogModel.aggregate_workspace_spend(wid))

    return jsonify({
        'by_user': by_user,
        'by_project': by_project,
        'by_model': by_model,
        'daily': daily,
        'totals': totals,
        'window': {
            'start': start.isoformat(),
            'end': end.isoformat(),
        },
        'credits': {
            'lifetime_topups_usd': lifetime_topups,
            'lifetime_spend_usd': lifetime_spend,
            'remaining_usd': round(lifetime_topups - lifetime_spend, 10),
        },
    }), 200


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/audit', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def workspace_audit(wid: str):
    """Return paginated audit log entries scoped to this workspace.

    Query params:
        limit:     int, default 50, capped at 200
        before:    ISO datetime — entries strictly older than this
        actor_id:  ObjectId hex string — filter by admin/actor
        action:    string — filter by exact action name

    Response: ``{entries: [...], next_before: ISO|null}``
    Each entry hydrates ``actor`` from ``admin_id`` (UserModel.find_by_id),
    omitting ``password_hash``.
    """
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    try:
        limit = int(request.args.get('limit', 50))
    except (TypeError, ValueError):
        return jsonify({'error': 'limit must be an integer'}), 400
    limit = max(1, min(200, limit))

    before = _parse_iso_date(request.args.get('before'))
    actor_id = request.args.get('actor_id') or None
    if actor_id and not validate_object_id(actor_id):
        return jsonify({'error': 'Invalid actor_id'}), 400
    action = request.args.get('action') or None

    rows = AuditLogModel.find_by_workspace(
        wid,
        limit=limit,
        before=before,
        actor_id=actor_id,
        action=action,
    ) or []

    # Hydrate actor from admin_id.
    actor_ids = []
    for r in rows:
        aid = r.get('admin_id')
        if aid is not None:
            actor_ids.append(aid if isinstance(aid, ObjectId) else ObjectId(aid))

    actor_map = {}
    if actor_ids:
        cursor = UserModel.get_collection().find(
            {'_id': {'$in': actor_ids}},
            {'email': 1, 'profile.display_name': 1, 'profile.avatar_url': 1},
        )
        for u in cursor:
            actor_map[str(u['_id'])] = {
                '_id': str(u['_id']),
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
                'avatar_url': (u.get('profile') or {}).get('avatar_url'),
            }

    entries = []
    last_created_at = None
    for r in rows:
        entry = {
            '_id': str(r['_id']) if r.get('_id') else None,
            'action': r.get('action'),
            'target_type': r.get('target_type'),
            'target_id': str(r['target_id']) if r.get('target_id') else None,
            'details': serialize_doc(r.get('details') or {}),
            'created_at': r['created_at'].isoformat()
                if isinstance(r.get('created_at'), datetime) else r.get('created_at'),
        }
        aid = r.get('admin_id')
        aid_str = str(aid) if aid is not None else None
        entry['actor'] = actor_map.get(aid_str) if aid_str else None
        entries.append(entry)
        if isinstance(r.get('created_at'), datetime):
            last_created_at = r['created_at']

    next_before = None
    if last_created_at is not None and len(rows) >= limit:
        next_before = last_created_at.isoformat()

    return jsonify({
        'entries': entries,
        'next_before': next_before,
    }), 200


# ---------------------------------------------------------------------------
# Billing — credit ledger
# ---------------------------------------------------------------------------

@workspaces_bp.route('/<wid>/billing/credits', methods=['POST'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def add_credits(wid: str):
    """Append a manual ledger entry and update workspace.credits_balance_usd."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    user = get_current_user()
    data = request.get_json(silent=True) or {}

    try:
        amount = float(data.get('amount_usd'))
    except (TypeError, ValueError):
        return jsonify({'error': 'amount_usd (number) is required'}), 400

    type_ = (data.get('type') or 'top_up').strip().lower()
    if type_ not in ('top_up', 'adjustment', 'refund'):
        return jsonify({
            'error': "type must be one of 'top_up' | 'adjustment' | 'refund'",
        }), 400

    note = (data.get('note') or '').strip()

    ws = WorkspaceModel.find_by_id(wid)
    if not ws:
        return jsonify({'error': 'Workspace not found'}), 404

    entry = CreditLedgerModel.add_entry(
        workspace_id=wid,
        amount_usd=amount,
        type=type_,
        note=note,
        added_by=user['_id'],
    )

    # Update materialized balance.
    new_balance = float(ws.get('credits_balance_usd') or 0) + amount
    WorkspaceModel.update(wid, {'credits_balance_usd': new_balance})

    return jsonify({
        'entry': serialize_doc(entry),
        'credits_balance_usd': new_balance,
    }), 201


@workspaces_bp.route('/<wid>/billing/ledger', methods=['GET'])
@jwt_required()
@active_user_required
@workspace_member(min_role='owner', id_kwarg='wid')
def list_ledger(wid: str):
    """Return paginated ledger entries (most recent first)."""
    if not validate_object_id(wid):
        return jsonify({'error': 'Invalid workspace ID'}), 400

    try:
        limit = int(request.args.get('limit', 100))
        skip = int(request.args.get('skip', 0))
    except ValueError:
        return jsonify({'error': 'limit/skip must be integers'}), 400
    limit = max(1, min(500, limit))

    rows = CreditLedgerModel.find_by_workspace(wid, limit=limit, skip=skip)

    # Hydrate added_by name.
    uid_objs = [r['added_by'] for r in rows if r.get('added_by') is not None]
    user_map = {}
    if uid_objs:
        cursor = UserModel.get_collection().find(
            {'_id': {'$in': uid_objs}},
            {'email': 1, 'profile.display_name': 1},
        )
        for u in cursor:
            user_map[str(u['_id'])] = {
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
            }

    out = []
    for r in rows:
        row = serialize_doc(r)
        added_by_str = str(r['added_by']) if r.get('added_by') else None
        info = user_map.get(added_by_str, {}) if added_by_str else {}
        row['added_by_user'] = {
            'id': added_by_str,
            'email': info.get('email'),
            'display_name': info.get('display_name'),
        }
        out.append(row)

    total = float(CreditLedgerModel.sum_credits(wid))

    return jsonify({
        'entries': out,
        'total_credits_usd': total,
    }), 200
