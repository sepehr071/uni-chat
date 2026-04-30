from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.llm_config import LLMConfigModel
from app.models.project import ProjectModel
from app.services.openrouter_service import OpenRouterService
from app.utils.helpers import serialize_doc
from app.utils.permissions import check_project_access
from app.utils.validators import validate_config_name, validate_system_prompt
from app.utils.decorators import active_user_required

configs_bp = Blueprint('configs', __name__)

ALLOWED_VISIBILITIES = {'private', 'public', 'template', 'project'}


@configs_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def get_configs():
    """Get LLM configurations.

    Without `project_id`: caller's owned configs (legacy behavior).
    With `?project_id=<pid>`: configs visible inside that project — caller's
    private + project-scoped + public + templates. Requires viewer role.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    skip = (page - 1) * limit

    project_id = request.args.get('project_id')
    if project_id:
        try:
            ObjectId(project_id)
        except (InvalidId, TypeError):
            return jsonify({'error': 'Invalid project_id'}), 400

        if not check_project_access(user_id, project_id, 'viewer'):
            return jsonify({'error': 'Forbidden'}), 403

        configs = LLMConfigModel.find_visible_to(
            user_id, project_id=project_id, skip=skip, limit=limit
        )
        return jsonify({
            'configs': serialize_doc(configs),
            'total': len(configs),
            'page': page,
            'limit': limit
        }), 200

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
    """Create a new LLM configuration.

    Optional body fields `project_id` / `workspace_id` scope the config to a
    project. When `project_id` is set we require editor role and auto-derive
    workspace_id from the project (any client-supplied workspace_id is ignored
    in that case). Visibility defaults to 'project' when project_id is present.
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

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

    project_id = data.get('project_id')
    workspace_id = data.get('workspace_id')

    if project_id:
        try:
            ObjectId(project_id)
        except (InvalidId, TypeError):
            return jsonify({'error': 'Invalid project_id'}), 400

        if not check_project_access(user_id, project_id, 'editor'):
            return jsonify({'error': 'Forbidden'}), 403

        project = ProjectModel.find_by_id(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        # Authoritative workspace_id from project — ignore any client value.
        workspace_id = project['workspace_id']

    visibility = data.get('visibility')
    if visibility is None:
        visibility = 'project' if project_id else 'private'
    elif visibility not in ALLOWED_VISIBILITIES:
        return jsonify({'error': 'Invalid visibility'}), 400

    config = LLMConfigModel.create(
        name=name,
        model_id=model_id,
        model_name=model_name,
        owner_id=user_id,
        description=data.get('description', ''),
        system_prompt=system_prompt,
        visibility=visibility,
        avatar=data.get('avatar'),
        parameters=data.get('parameters'),
        tags=data.get('tags', []),
        project_id=project_id,
        workspace_id=workspace_id,
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

    data = request.get_json(silent=True) or {}

    # Reassigning project_id post-creation is intentionally not supported —
    # it crosses permission/workspace boundaries. Caller should duplicate.
    if 'project_id' in data:
        existing_pid = config.get('project_id')
        existing_pid_str = str(existing_pid) if existing_pid else None
        new_pid = data['project_id']
        new_pid_str = str(new_pid) if new_pid else None
        if existing_pid_str != new_pid_str:
            return jsonify({'error': 'cannot_reassign_project'}), 400

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

    if 'visibility' in data:
        if data['visibility'] not in ALLOWED_VISIBILITIES:
            return jsonify({'error': 'Invalid visibility'}), 400
        update_fields['visibility'] = data['visibility']

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


@configs_bp.route('/enhance-prompt', methods=['POST'])
@jwt_required()
@active_user_required
def enhance_prompt():
    """Enhance a system prompt using LLM"""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}
    prompt = data.get('prompt', '').strip()

    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    if len(prompt) > 10000:
        return jsonify({'error': 'Prompt too long (max 10000 characters)'}), 400

    enhancement_prompt = f"""You are an expert prompt engineer. Improve this system prompt to be clearer, more specific, and more effective.

Key improvements to make:
- Add clear role definition if missing
- Add specific behavioral guidelines
- Add output format instructions if relevant
- Make instructions explicit and unambiguous
- Keep the original intent intact

Original prompt:
{prompt}

Return ONLY the improved prompt, no explanations or extra text."""

    response = OpenRouterService.chat_completion(
        messages=[{'role': 'user', 'content': enhancement_prompt}],
        model='x-ai/grok-4.1-fast',
        max_tokens=1024,
        temperature=0.7,
        stream=False,
        user_id=user_id,
        conversation_id=None,
        feature='config_suggest'
    )

    if 'error' in response:
        return jsonify({'error': response['error'].get('message', 'Enhancement failed')}), 500

    try:
        enhanced = response['choices'][0]['message']['content'].strip()
        return jsonify({'enhanced_prompt': enhanced}), 200
    except (KeyError, IndexError):
        return jsonify({'error': 'Invalid response from LLM'}), 500
