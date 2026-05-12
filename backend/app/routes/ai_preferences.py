import zoneinfo

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.user import UserModel
from app.utils.decorators import active_user_required

ai_preferences_bp = Blueprint('ai_preferences', __name__)


# Valid options for validation
VALID_EXPERTISE_LEVELS = ['beginner', 'intermediate', 'expert']
VALID_TONES = ['professional', 'friendly', 'casual']
VALID_RESPONSE_STYLES = ['concise', 'detailed', 'balanced']

# Whitelist top-level keys accepted on PUT.
# Anything else is silently dropped to prevent clients stashing arbitrary
# nested data on `user.ai_preferences.*`.
ALLOWED_TOP_LEVEL_KEYS = {
    'enabled',
    'user_info',
    'behavior',
    'custom_instructions',
    'timezone',
}
# Nested key whitelists per allowed object.
ALLOWED_USER_INFO_KEYS = {'name', 'language', 'expertise_level'}
ALLOWED_BEHAVIOR_KEYS = {'tone', 'response_style'}


@ai_preferences_bp.route('/ai-preferences', methods=['GET'])
@jwt_required()
@active_user_required
def get_ai_preferences():
    """Get current user's AI preferences"""
    user = get_current_user()
    user_id = str(user['_id'])

    preferences = UserModel.get_ai_preferences(user_id)
    timezone = UserModel.get_timezone(user_id)

    return jsonify({
        'preferences': preferences,
        'timezone': timezone,
    }), 200


@ai_preferences_bp.route('/ai-preferences', methods=['PUT'])
@jwt_required()
@active_user_required
def update_ai_preferences():
    """Update current user's AI preferences"""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    # Whitelist: drop unknown top-level keys; reject if client passed only junk.
    unknown_keys = [k for k in data.keys() if k not in ALLOWED_TOP_LEVEL_KEYS]
    data = {k: v for k, v in data.items() if k in ALLOWED_TOP_LEVEL_KEYS}
    if not data:
        return jsonify({
            'error': 'No recognized preference fields provided',
            'allowed': sorted(ALLOWED_TOP_LEVEL_KEYS),
            'rejected': unknown_keys,
        }), 400

    # Whitelist nested keys on user_info / behavior so clients can't sneak
    # arbitrary fields through (e.g. user_info.is_admin).
    if isinstance(data.get('user_info'), dict):
        data['user_info'] = {
            k: v for k, v in data['user_info'].items() if k in ALLOWED_USER_INFO_KEYS
        }
    if isinstance(data.get('behavior'), dict):
        data['behavior'] = {
            k: v for k, v in data['behavior'].items() if k in ALLOWED_BEHAVIOR_KEYS
        }

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

    # Validate timezone
    if 'timezone' in data:
        tz_str = data.get('timezone')
        if not isinstance(tz_str, str) or not tz_str.strip():
            errors.append('timezone must be a non-empty string')
        else:
            try:
                zoneinfo.ZoneInfo(tz_str)
            except Exception:
                errors.append(f'timezone is not a valid IANA timezone: {tz_str}')

    if errors:
        return jsonify({'error': 'Validation failed', 'details': errors}), 400

    # Update preferences + timezone. Timezone is a separate mongo write; if it
    # fails (e.g. db down between writes) we surface a 500 rather than silently
    # leaving the user with stale tz under fresh preferences.
    UserModel.update_ai_preferences(user_id, data)
    if 'timezone' in data:
        try:
            UserModel.update_timezone(user_id, data['timezone'].strip())
        except Exception as exc:
            from flask import current_app
            current_app.logger.exception('ai_preferences: timezone update failed')
            return jsonify({
                'error': 'Preferences saved but timezone update failed',
                'detail': str(exc),
            }), 500

    # Return updated preferences
    updated_preferences = UserModel.get_ai_preferences(user_id)
    timezone = UserModel.get_timezone(user_id)

    return jsonify({
        'message': 'AI preferences updated successfully',
        'preferences': updated_preferences,
        'timezone': timezone,
    }), 200
