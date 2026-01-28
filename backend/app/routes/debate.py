"""
Debate Routes

REST endpoints for debate session management.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.debate_session import DebateSessionModel
from app.models.debate_message import DebateMessageModel
from app.models.llm_config import LLMConfigModel
from app.utils.helpers import serialize_doc

debate_bp = Blueprint('debate', __name__)


@debate_bp.route('/sessions', methods=['GET'])
@jwt_required()
def list_sessions():
    """
    List user's debate sessions with pagination.

    Query params:
        page: Page number (default 1)
        limit: Items per page (default 20)
    """
    user = get_current_user()
    user_id = str(user['_id'])

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    limit = min(limit, 50)  # Cap at 50

    sessions = DebateSessionModel.find_by_user(user_id, page=page, limit=limit)
    total = DebateSessionModel.count_by_user(user_id)

    # Quick models mapping
    QUICK_MODELS = {
        'google/gemini-3-flash-preview': 'Gemini 3 Flash',
        'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
        'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
        'openai/gpt-5.2': 'GPT-5.2',
        'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
    }

    # Enrich sessions with config names
    enriched_sessions = []
    for session in sessions:
        session_data = serialize_doc(session)

        # Get config names
        config_names = []
        for config_id in session.get('config_ids', []):
            config_id_str = str(config_id)
            if config_id_str.startswith('quick:'):
                model_id = config_id_str.replace('quick:', '')
                config_names.append(QUICK_MODELS.get(model_id, model_id))
            else:
                config = LLMConfigModel.find_by_id(config_id_str)
                if config:
                    config_names.append(config.get('name', 'Unknown'))
                else:
                    config_names.append('Deleted Config')

        # Get judge name
        judge_config_id = str(session.get('judge_config_id', ''))
        if judge_config_id.startswith('quick:'):
            model_id = judge_config_id.replace('quick:', '')
            judge_name = QUICK_MODELS.get(model_id, model_id)
        else:
            judge_config = LLMConfigModel.find_by_id(judge_config_id)
            judge_name = judge_config.get('name', 'Unknown') if judge_config else 'Deleted Config'

        session_data['config_names'] = config_names
        session_data['judge_name'] = judge_name
        enriched_sessions.append(session_data)

    return jsonify({
        'sessions': enriched_sessions,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit
    })


@debate_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_session():
    """
    Create a new debate session.

    Body:
        topic: str (required)
        config_ids: list of config IDs (2-5 required)
        judge_config_id: str (required)
        rounds: int (optional, default 3)
        max_tokens: int (optional, default 2048)
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    # Validate required fields
    topic = data.get('topic', '').strip()
    if not topic:
        return jsonify({'error': 'Topic is required'}), 400

    config_ids = data.get('config_ids', [])
    if not config_ids or len(config_ids) < 2:
        return jsonify({'error': 'At least 2 debater configs are required'}), 400
    if len(config_ids) > 5:
        return jsonify({'error': 'Maximum 5 debater configs allowed'}), 400

    judge_config_id = data.get('judge_config_id')
    if not judge_config_id:
        return jsonify({'error': 'Judge config is required'}), 400

    # Validate configs exist (skip validation for quick models)
    for config_id in config_ids:
        if not str(config_id).startswith('quick:'):
            config = LLMConfigModel.find_by_id(config_id)
            if not config:
                return jsonify({'error': f'Config not found: {config_id}'}), 404

    if not str(judge_config_id).startswith('quick:'):
        judge_config = LLMConfigModel.find_by_id(judge_config_id)
        if not judge_config:
            return jsonify({'error': 'Judge config not found'}), 404

    # Get optional settings
    rounds = data.get('rounds', 3)
    rounds = max(0, min(rounds, 20))  # 0-20 rounds (0 = infinite)

    max_tokens = data.get('max_tokens', 2048)
    max_tokens = max(256, min(max_tokens, 8192))  # 256-8192 tokens

    # New debate settings
    thinking_type = data.get('thinking_type', 'balanced')
    if thinking_type not in ['logical', 'feeling', 'balanced']:
        thinking_type = 'balanced'

    response_length = data.get('response_length', 'balanced')
    if response_length not in ['short', 'balanced', 'long']:
        response_length = 'balanced'

    # Create session
    session = DebateSessionModel.create(
        user_id=user_id,
        topic=topic,
        config_ids=config_ids,
        judge_config_id=judge_config_id,
        rounds=rounds,
        max_tokens=max_tokens,
        thinking_type=thinking_type,
        response_length=response_length
    )

    return jsonify({
        'session': serialize_doc(session),
        'message': 'Debate session created'
    }), 201


@debate_bp.route('/sessions/<session_id>', methods=['GET'])
@jwt_required()
def get_session(session_id):
    """
    Get a debate session with all messages.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    session = DebateSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    # Get messages
    messages = DebateMessageModel.find_by_session(session_id)

    # Quick models mapping
    QUICK_MODELS = {
        'google/gemini-3-flash-preview': 'Gemini 3 Flash',
        'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
        'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
        'openai/gpt-5.2': 'GPT-5.2',
        'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
    }

    # Build config mapping with full details for frontend
    config_map = {}
    debaters = []
    for config_id in session.get('config_ids', []):
        config_id_str = str(config_id)
        if config_id_str.startswith('quick:'):
            # Handle quick model
            model_id = config_id_str.replace('quick:', '')
            model_name = QUICK_MODELS.get(model_id, model_id)
            config_map[config_id_str] = model_name
            debaters.append({
                '_id': config_id_str,
                'name': model_name,
                'model_id': model_id,
                'isQuickModel': True
            })
        else:
            config = LLMConfigModel.find_by_id(config_id_str)
            if config:
                config_map[config_id_str] = config.get('name', 'Unknown')
                debaters.append({
                    '_id': config_id_str,
                    'name': config.get('name', 'Unknown'),
                    'model_id': config.get('model_id', '')
                })
            else:
                config_map[config_id_str] = 'Deleted Config'
                debaters.append({
                    '_id': config_id_str,
                    'name': 'Deleted Config',
                    'model_id': ''
                })

    judge_config_id_str = str(session.get('judge_config_id', ''))
    if judge_config_id_str.startswith('quick:'):
        model_id = judge_config_id_str.replace('quick:', '')
        judge_name = QUICK_MODELS.get(model_id, model_id)
        judge_data = {
            '_id': judge_config_id_str,
            'name': judge_name,
            'model_id': model_id,
            'isQuickModel': True
        }
    else:
        judge_config = LLMConfigModel.find_by_id(judge_config_id_str)
        judge_name = judge_config.get('name', 'Unknown') if judge_config else 'Deleted Config'
        judge_data = None
        if judge_config:
            judge_data = {
                '_id': judge_config_id_str,
                'name': judge_config.get('name', 'Unknown'),
                'model_id': judge_config.get('model_id', '')
            }

    # Enrich messages with speaker names
    enriched_messages = []
    for msg in messages:
        msg_data = serialize_doc(msg)
        config_id = str(msg.get('config_id', ''))
        if msg.get('role') == 'judge':
            msg_data['speaker_name'] = f"Judge ({judge_name})"
        else:
            msg_data['speaker_name'] = config_map.get(config_id, 'Unknown')
        enriched_messages.append(msg_data)

    session_data = serialize_doc(session)
    session_data['config_names'] = list(config_map.values())
    session_data['judge_name'] = judge_name
    session_data['debaters'] = debaters
    session_data['judge'] = judge_data
    session_data['messages'] = enriched_messages

    return jsonify({'session': session_data})


@debate_bp.route('/sessions/<session_id>', methods=['DELETE'])
@jwt_required()
def delete_session(session_id):
    """
    Delete a debate session and all its messages.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    session = DebateSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    # Delete messages first
    deleted_messages = DebateMessageModel.delete_by_session(session_id)

    # Delete session
    deleted = DebateSessionModel.delete(session_id, user_id)

    if deleted:
        return jsonify({
            'message': 'Session deleted',
            'deleted_messages': deleted_messages
        })
    else:
        return jsonify({'error': 'Failed to delete session'}), 500


@debate_bp.route('/sessions/<session_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_session(session_id):
    """
    Cancel an in-progress debate session.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    session = DebateSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    if session.get('status') not in ['pending', 'in_progress']:
        return jsonify({'error': 'Session cannot be cancelled'}), 400

    DebateSessionModel.update_status(session_id, 'cancelled')

    return jsonify({'message': 'Session cancelled'})
