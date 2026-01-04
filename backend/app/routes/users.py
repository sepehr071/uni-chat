from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.user import UserModel
from app.models.conversation import ConversationModel
from app.models.llm_config import LLMConfigModel
from app.utils.helpers import serialize_doc
from app.utils.validators import validate_display_name
from app.utils.decorators import active_user_required

users_bp = Blueprint('users', __name__)


@users_bp.route('/profile', methods=['GET'])
@jwt_required()
@active_user_required
def get_profile():
    """Get user profile"""
    user = get_current_user()

    return jsonify({
        'profile': {
            'id': str(user['_id']),
            'email': user['email'],
            'display_name': user['profile']['display_name'],
            'avatar_url': user['profile'].get('avatar_url'),
            'bio': user['profile'].get('bio', ''),
            'created_at': user['created_at'].isoformat()
        }
    }), 200


@users_bp.route('/profile', methods=['PUT'])
@jwt_required()
@active_user_required
def update_profile():
    """Update user profile"""
    user = get_current_user()
    data = request.get_json()

    update_fields = {}

    if 'display_name' in data:
        is_valid, error = validate_display_name(data['display_name'])
        if not is_valid:
            return jsonify({'error': error}), 400
        update_fields['profile.display_name'] = data['display_name'].strip()

    if 'avatar_url' in data:
        update_fields['profile.avatar_url'] = data['avatar_url']

    if 'bio' in data:
        bio = data['bio'][:500] if data['bio'] else ''  # Limit bio length
        update_fields['profile.bio'] = bio

    if update_fields:
        UserModel.update(user['_id'], update_fields)

    updated_user = UserModel.find_by_id(user['_id'])
    return jsonify({
        'profile': {
            'id': str(updated_user['_id']),
            'display_name': updated_user['profile']['display_name'],
            'avatar_url': updated_user['profile'].get('avatar_url'),
            'bio': updated_user['profile'].get('bio', '')
        }
    }), 200


@users_bp.route('/stats', methods=['GET'])
@jwt_required()
@active_user_required
def get_stats():
    """Get user usage statistics"""
    user = get_current_user()
    user_id = str(user['_id'])

    # Get conversation count
    total_conversations = ConversationModel.count_by_user(user_id)
    archived_conversations = ConversationModel.count_by_user(user_id, archived=True)

    # Get config count
    total_configs = LLMConfigModel.count_by_owner(user_id)

    return jsonify({
        'stats': {
            'messages_sent': user['usage']['messages_sent'],
            'tokens_used': user['usage']['tokens_used'],
            'tokens_limit': user['usage']['tokens_limit'],
            'tokens_remaining': (
                user['usage']['tokens_limit'] - user['usage']['tokens_used']
                if user['usage']['tokens_limit'] != -1 else -1
            ),
            'total_conversations': total_conversations,
            'archived_conversations': archived_conversations,
            'total_configs': total_configs,
            'last_active': user['usage']['last_active'].isoformat()
        }
    }), 200


@users_bp.route('/settings', methods=['GET'])
@jwt_required()
@active_user_required
def get_settings():
    """Get user settings"""
    user = get_current_user()

    return jsonify({
        'settings': {
            'default_config_id': str(user['settings']['default_config_id']) if user['settings'].get('default_config_id') else None,
            'theme': user['settings'].get('theme', 'dark'),
            'notifications_enabled': user['settings'].get('notifications_enabled', True)
        }
    }), 200


@users_bp.route('/settings', methods=['PUT'])
@jwt_required()
@active_user_required
def update_settings():
    """Update user settings"""
    user = get_current_user()
    data = request.get_json()

    update_fields = {}

    if 'default_config_id' in data:
        from bson import ObjectId
        config_id = data['default_config_id']
        if config_id:
            # Verify config exists and user has access
            config = LLMConfigModel.find_by_id(config_id)
            if not config:
                return jsonify({'error': 'Config not found'}), 404
            update_fields['settings.default_config_id'] = ObjectId(config_id)
        else:
            update_fields['settings.default_config_id'] = None

    if 'theme' in data:
        if data['theme'] in ['dark', 'light']:
            update_fields['settings.theme'] = data['theme']

    if 'notifications_enabled' in data:
        update_fields['settings.notifications_enabled'] = bool(data['notifications_enabled'])

    if update_fields:
        UserModel.update(user['_id'], update_fields)

    updated_user = UserModel.find_by_id(user['_id'])
    return jsonify({
        'settings': {
            'default_config_id': str(updated_user['settings']['default_config_id']) if updated_user['settings'].get('default_config_id') else None,
            'theme': updated_user['settings'].get('theme', 'dark'),
            'notifications_enabled': updated_user['settings'].get('notifications_enabled', True)
        }
    }), 200
