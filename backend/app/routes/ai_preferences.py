from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.user import UserModel
from app.utils.decorators import active_user_required

ai_preferences_bp = Blueprint('ai_preferences', __name__)


# Valid options for validation
VALID_EXPERTISE_LEVELS = ['beginner', 'intermediate', 'expert']
VALID_TONES = ['professional', 'friendly', 'casual']
VALID_RESPONSE_STYLES = ['concise', 'detailed', 'balanced']


@ai_preferences_bp.route('/ai-preferences', methods=['GET'])
@jwt_required()
@active_user_required
def get_ai_preferences():
    """Get current user's AI preferences"""
    user = get_current_user()
    user_id = str(user['_id'])

    preferences = UserModel.get_ai_preferences(user_id)

    return jsonify({
        'preferences': preferences
    }), 200


@ai_preferences_bp.route('/ai-preferences', methods=['PUT'])
@jwt_required()
@active_user_required
def update_ai_preferences():
    """Update current user's AI preferences"""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    # Validate fields if provided
    errors = []

    # Validate enabled (boolean)
    if 'enabled' in data and not isinstance(data['enabled'], bool):
        errors.append('enabled must be a boolean')

    # Validate user_info
    if 'user_info' in data:
        user_info = data['user_info']
        if not isinstance(user_info, dict):
            errors.append('user_info must be an object')
        else:
            if 'name' in user_info and not isinstance(user_info['name'], str):
                errors.append('user_info.name must be a string')
            if 'language' in user_info and not isinstance(user_info['language'], str):
                errors.append('user_info.language must be a string')
            if 'expertise_level' in user_info:
                if user_info['expertise_level'] not in VALID_EXPERTISE_LEVELS:
                    errors.append(f'user_info.expertise_level must be one of: {", ".join(VALID_EXPERTISE_LEVELS)}')

    # Validate behavior
    if 'behavior' in data:
        behavior = data['behavior']
        if not isinstance(behavior, dict):
            errors.append('behavior must be an object')
        else:
            if 'tone' in behavior and behavior['tone'] not in VALID_TONES:
                errors.append(f'behavior.tone must be one of: {", ".join(VALID_TONES)}')
            if 'response_style' in behavior and behavior['response_style'] not in VALID_RESPONSE_STYLES:
                errors.append(f'behavior.response_style must be one of: {", ".join(VALID_RESPONSE_STYLES)}')

    # Validate custom_instructions
    if 'custom_instructions' in data:
        if not isinstance(data['custom_instructions'], str):
            errors.append('custom_instructions must be a string')
        elif len(data['custom_instructions']) > 2000:
            errors.append('custom_instructions must not exceed 2000 characters')

    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    # Update preferences
    UserModel.update_ai_preferences(user_id, data)

    # Return updated preferences
    updated_preferences = UserModel.get_ai_preferences(user_id)

    return jsonify({
        'message': 'AI preferences updated successfully',
        'preferences': updated_preferences
    }), 200
