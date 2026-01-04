from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.llm_config import LLMConfigModel
from app.utils.helpers import serialize_doc
from app.utils.validators import validate_config_name, validate_system_prompt
from app.utils.decorators import active_user_required

configs_bp = Blueprint('configs', __name__)


@configs_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def get_configs():
    """Get user's LLM configurations"""
    user = get_current_user()
    user_id = str(user['_id'])

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    skip = (page - 1) * limit

    configs = LLMConfigModel.find_by_owner(user_id, skip=skip, limit=limit)
    total = LLMConfigModel.count_by_owner(user_id)

    return jsonify({
        'configs': serialize_doc(configs),
        'total': total,
        'page': page,
        'limit': limit
    }), 200


@configs_bp.route('/<config_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_config(config_id):
    """Get a specific configuration"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    # Allow access if user owns it, or if it's public/template
    if str(config.get('owner_id')) != user_id and config['visibility'] == 'private':
        return jsonify({'error': 'Config not found'}), 404

    return jsonify({
        'config': serialize_doc(config)
    }), 200


@configs_bp.route('', methods=['POST'])
@jwt_required()
@active_user_required
def create_config():
    """Create a new LLM configuration"""
    user = get_current_user()
    data = request.get_json()

    name = data.get('name', '').strip()
    model_id = data.get('model_id')
    model_name = data.get('model_name', model_id)

    # Validate
    is_valid, error = validate_config_name(name)
    if not is_valid:
        return jsonify({'error': error}), 400

    if not model_id:
        return jsonify({'error': 'model_id is required'}), 400

    system_prompt = data.get('system_prompt', '')
    is_valid, error = validate_system_prompt(system_prompt)
    if not is_valid:
        return jsonify({'error': error}), 400

    config = LLMConfigModel.create(
        name=name,
        model_id=model_id,
        model_name=model_name,
        owner_id=str(user['_id']),
        description=data.get('description', ''),
        system_prompt=system_prompt,
        visibility='private',
        avatar=data.get('avatar'),
        parameters=data.get('parameters'),
        tags=data.get('tags', [])
    )

    return jsonify({
        'config': serialize_doc(config)
    }), 201


@configs_bp.route('/<config_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_config(config_id):
    """Update a configuration"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or str(config.get('owner_id')) != user_id:
        return jsonify({'error': 'Config not found'}), 404

    data = request.get_json()
    update_fields = {}

    if 'name' in data:
        is_valid, error = validate_config_name(data['name'])
        if not is_valid:
            return jsonify({'error': error}), 400
        update_fields['name'] = data['name'].strip()

    if 'description' in data:
        update_fields['description'] = data['description']

    if 'system_prompt' in data:
        is_valid, error = validate_system_prompt(data['system_prompt'])
        if not is_valid:
            return jsonify({'error': error}), 400
        update_fields['system_prompt'] = data['system_prompt']

    if 'model_id' in data:
        update_fields['model_id'] = data['model_id']
        update_fields['model_name'] = data.get('model_name', data['model_id'])

    if 'avatar' in data:
        update_fields['avatar'] = data['avatar']

    if 'parameters' in data:
        update_fields['parameters'] = data['parameters']

    if 'tags' in data:
        update_fields['tags'] = data['tags']

    if update_fields:
        LLMConfigModel.update(config_id, update_fields)

    updated = LLMConfigModel.find_by_id(config_id)
    return jsonify({
        'config': serialize_doc(updated)
    }), 200


@configs_bp.route('/<config_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_config(config_id):
    """Delete a configuration"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or str(config.get('owner_id')) != user_id:
        return jsonify({'error': 'Config not found'}), 404

    LLMConfigModel.delete(config_id)

    return jsonify({'message': 'Config deleted'}), 200


@configs_bp.route('/<config_id>/publish', methods=['POST'])
@jwt_required()
@active_user_required
def publish_config(config_id):
    """Make a configuration public"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or str(config.get('owner_id')) != user_id:
        return jsonify({'error': 'Config not found'}), 404

    LLMConfigModel.set_visibility(config_id, 'public')

    return jsonify({
        'message': 'Config published',
        'visibility': 'public'
    }), 200


@configs_bp.route('/<config_id>/unpublish', methods=['POST'])
@jwt_required()
@active_user_required
def unpublish_config(config_id):
    """Make a configuration private"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or str(config.get('owner_id')) != user_id:
        return jsonify({'error': 'Config not found'}), 404

    LLMConfigModel.set_visibility(config_id, 'private')

    return jsonify({
        'message': 'Config unpublished',
        'visibility': 'private'
    }), 200


@configs_bp.route('/<config_id>/duplicate', methods=['POST'])
@jwt_required()
@active_user_required
def duplicate_config(config_id):
    """Duplicate a configuration"""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json() or {}

    config = LLMConfigModel.find_by_id(config_id)
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    # Allow duplicating own configs or public/template configs
    if str(config.get('owner_id')) != user_id and config['visibility'] == 'private':
        return jsonify({'error': 'Config not found'}), 404

    new_name = data.get('name')
    new_config = LLMConfigModel.duplicate(config_id, user_id, new_name)

    return jsonify({
        'config': serialize_doc(new_config)
    }), 201
