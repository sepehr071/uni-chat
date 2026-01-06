from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.arena_session import ArenaSessionModel
from app.models.arena_message import ArenaMessageModel
from app.models.llm_config import LLMConfigModel
from app.utils.helpers import serialize_doc

arena_bp = Blueprint('arena', __name__)


@arena_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_session():
    """Create a new arena session"""
    user_id = get_jwt_identity()
    data = request.get_json()

    config_ids = data.get('config_ids', [])
    if len(config_ids) < 2:
        return jsonify({'error': 'At least 2 configs required'}), 400
    if len(config_ids) > 4:
        return jsonify({'error': 'Maximum 4 configs allowed'}), 400

    # Verify configs exist
    for config_id in config_ids:
        config = LLMConfigModel.find_by_id(config_id)
        if not config:
            return jsonify({'error': f'Config {config_id} not found'}), 404

    title = data.get('title', 'Arena Session')
    session = ArenaSessionModel.create(user_id, config_ids, title)

    return jsonify({'session': serialize_doc(session)}), 201


@arena_bp.route('/sessions', methods=['GET'])
@jwt_required()
def list_sessions():
    """List user's arena sessions"""
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)

    skip = (page - 1) * limit
    sessions = ArenaSessionModel.find_by_user(user_id, skip=skip, limit=limit)

    return jsonify({
        'sessions': [serialize_doc(s) for s in sessions]
    })


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

    # Get config details
    configs = []
    for config_id in session['config_ids']:
        config = LLMConfigModel.find_by_id(config_id)
        if config:
            configs.append(serialize_doc(config))

    return jsonify({
        'session': serialize_doc(session),
        'messages': [serialize_doc(m) for m in messages],
        'configs': configs
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
