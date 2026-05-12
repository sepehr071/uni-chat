from bson import ObjectId
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.arena_session import ArenaSessionModel
from app.models.arena_message import ArenaMessageModel
from app.models.llm_config import LLMConfigModel
from app.utils.helpers import serialize_doc
from app.utils.permissions import check_project_access
from app.utils.config_resolver import resolve_config as resolve_arena_config

arena_bp = Blueprint('arena', __name__)


@arena_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_session():
    """Create a new arena session"""
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    config_ids = data.get('config_ids', [])
    if len(config_ids) < 2:
        return jsonify({'error': 'At least 2 configs required'}), 400
    if len(config_ids) > 4:
        return jsonify({'error': 'Maximum 4 configs allowed'}), 400

    # P1.9: accept optional project_id so the session — and every usage_log
    # row it emits via streamed completions — is attributed to the right
    # project. Validate access if provided.
    project_id = data.get('project_id') or None
    if project_id:
        if not isinstance(project_id, str) or not ObjectId.is_valid(project_id):
            return jsonify({'error': 'project_id must be a valid 24-char hex ObjectId'}), 400
        if not check_project_access(user_id, project_id, 'viewer'):
            return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403

    # P1.8: verify the caller can actually see each requested config. Without
    # this guard, an arena session could probe another user's private configs
    # (config_id is opaque but enumerable via brute-force / leaked IDs). Quick
    # models (prefix 'quick:') are always visible. Public + template + caller-
    # owned + same-project configs are honoured via the standard visibility
    # rules already encoded in resolve_config.
    for config_id in config_ids:
        if isinstance(config_id, str) and config_id.startswith('quick:'):
            # Resolver also validates the quick-model id against the registry.
            cfg = resolve_arena_config(config_id, user_id=user_id, project_id=project_id)
            if not cfg:
                return jsonify({'error': f'Config {config_id} not accessible'}), 403
            continue
        if not isinstance(config_id, str) or not ObjectId.is_valid(config_id):
            return jsonify({'error': f'Invalid config id: {config_id}'}), 400
        cfg = LLMConfigModel.find_by_id(config_id)
        if not cfg:
            return jsonify({'error': f'Config {config_id} not found'}), 404
        # Allow: caller owns it, OR it's public/template, OR it's project-scoped
        # to a project the caller can access.
        is_owner = str(cfg.get('owner_id') or '') == str(user_id)
        visibility = cfg.get('visibility')
        if is_owner or visibility in ('public', 'template'):
            continue
        cfg_project_id = cfg.get('project_id')
        if cfg_project_id and check_project_access(user_id, str(cfg_project_id), 'viewer'):
            continue
        return jsonify({'error': f'Config {config_id} not accessible'}), 403

    title = data.get('title', 'Arena Session')
    session = ArenaSessionModel.create(user_id, config_ids, title)
    # Persist project_id without changing the model signature (model is
    # outside this fix's ownership scope — patched via the existing update()).
    if project_id:
        ArenaSessionModel.update(str(session['_id']), {'project_id': ObjectId(project_id)})
        session['project_id'] = ObjectId(project_id)

    return jsonify({'session': serialize_doc(session)}), 201


@arena_bp.route('/sessions', methods=['GET'])
@jwt_required()
def list_sessions():
    """List user's arena sessions"""
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    limit = min(max(limit, 1), 50)

    skip = (page - 1) * limit
    sessions = ArenaSessionModel.find_by_user(user_id, skip=skip, limit=limit)
    total = ArenaSessionModel.count_by_user(user_id)

    return jsonify({
        'sessions': [serialize_doc(s) for s in sessions],
        'total': total,
        'page': page,
        'limit': limit,
        'pages': (total + limit - 1) // limit if limit else 1,
    })


@arena_bp.route('/sessions/<session_id>', methods=['PATCH'])
@jwt_required()
def update_session(session_id):
    """Update a session — currently supports {config_ids, title}.

    Backend now stays in sync with the panel's add/remove UI (P2.12). All
    config-id semantics from create_session (quick:* visibility, ownership +
    project access) are re-validated to prevent privilege escalation via PATCH.
    """
    user_id = get_jwt_identity()
    if not ObjectId.is_valid(session_id):
        return jsonify({'error': 'Invalid session id'}), 400

    session = ArenaSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json(silent=True) or {}
    updates = {}

    if 'title' in data:
        title = str(data['title']).strip()
        if not title:
            return jsonify({'error': 'title must be non-empty'}), 400
        updates['title'] = title[:200]

    if 'config_ids' in data:
        config_ids = data.get('config_ids') or []
        if not isinstance(config_ids, list) or len(config_ids) < 2:
            return jsonify({'error': 'At least 2 configs required'}), 400
        if len(config_ids) > 4:
            return jsonify({'error': 'Maximum 4 configs allowed'}), 400

        project_id = session.get('project_id')
        project_id_str = str(project_id) if project_id else None
        normalized: list = []
        for cid in config_ids:
            if not isinstance(cid, str):
                return jsonify({'error': f'Invalid config id: {cid}'}), 400
            if cid.startswith('quick:'):
                cfg = resolve_arena_config(cid, user_id=user_id, project_id=project_id_str)
                if not cfg:
                    return jsonify({'error': f'Config {cid} not accessible'}), 403
                normalized.append(cid)
                continue
            if not ObjectId.is_valid(cid):
                return jsonify({'error': f'Invalid config id: {cid}'}), 400
            cfg = LLMConfigModel.find_by_id(cid)
            if not cfg:
                return jsonify({'error': f'Config {cid} not found'}), 404
            is_owner = str(cfg.get('owner_id') or '') == str(user_id)
            visibility = cfg.get('visibility')
            if is_owner or visibility in ('public', 'template'):
                normalized.append(ObjectId(cid))
                continue
            cfg_project_id = cfg.get('project_id')
            if cfg_project_id and check_project_access(user_id, str(cfg_project_id), 'viewer'):
                normalized.append(ObjectId(cid))
                continue
            return jsonify({'error': f'Config {cid} not accessible'}), 403
        updates['config_ids'] = normalized

    if not updates:
        return jsonify({'error': 'No supported fields to update'}), 400

    ArenaSessionModel.update(session_id, updates)
    refreshed = ArenaSessionModel.find_by_id(session_id)
    return jsonify({'session': serialize_doc(refreshed)})


@arena_bp.route('/sessions/<session_id>', methods=['GET'])
@jwt_required()
def get_session(session_id):
    """Get session with messages"""
    user_id = get_jwt_identity()

    session = ArenaSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    messages = ArenaMessageModel.find_by_session(session_id)

    # Get config details in single batch query (avoids N+1)
    configs = LLMConfigModel.find_by_ids(session['config_ids'])

    return jsonify({
        'session': serialize_doc(session),
        'messages': [serialize_doc(m) for m in messages],
        'configs': [serialize_doc(c) for c in configs]
    })


@arena_bp.route('/sessions/<session_id>', methods=['DELETE'])
@jwt_required()
def delete_session(session_id):
    """Delete a session and its messages"""
    user_id = get_jwt_identity()

    session = ArenaSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    ArenaMessageModel.delete_by_session(session_id)
    ArenaSessionModel.delete(session_id)

    return jsonify({'message': 'Session deleted'})
