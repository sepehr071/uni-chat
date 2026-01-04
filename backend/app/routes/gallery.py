from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.utils.helpers import serialize_doc
from app.utils.decorators import active_user_required

gallery_bp = Blueprint('gallery', __name__)


@gallery_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def browse_gallery():
    """Browse public configurations"""
    search = request.args.get('search')
    tags = request.args.get('tags')
    if tags:
        tags = tags.split(',')
    model = request.args.get('model')
    sort_by = request.args.get('sort', 'uses_count')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    skip = (page - 1) * limit

    configs = LLMConfigModel.find_public(
        search=search,
        tags=tags,
        model=model,
        sort_by=sort_by,
        skip=skip,
        limit=limit
    )

    total = LLMConfigModel.count_public()

    return jsonify({
        'configs': serialize_doc(configs),
        'total': total,
        'page': page,
        'limit': limit,
        'has_more': skip + len(configs) < total
    }), 200


@gallery_bp.route('/templates', methods=['GET'])
@jwt_required()
@active_user_required
def get_templates():
    """Get admin-created templates"""
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    skip = (page - 1) * limit

    templates = LLMConfigModel.find_templates(skip=skip, limit=limit)

    return jsonify({
        'templates': serialize_doc(templates)
    }), 200


@gallery_bp.route('/<config_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_public_config(config_id):
    """Get a public configuration details"""
    config = LLMConfigModel.find_by_id(config_id)
    if not config or config['visibility'] not in ['public', 'template']:
        return jsonify({'error': 'Config not found'}), 404

    return jsonify({
        'config': serialize_doc(config)
    }), 200


@gallery_bp.route('/<config_id>/save', methods=['POST'])
@jwt_required()
@active_user_required
def save_config(config_id):
    """Save a public config to user's collection"""
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or config['visibility'] not in ['public', 'template']:
        return jsonify({'error': 'Config not found'}), 404

    # Add to user's saved configs
    UserModel.add_saved_config(user_id, config_id)

    # Increment saves count
    LLMConfigModel.increment_saves(config_id)

    return jsonify({
        'message': 'Config saved to your collection'
    }), 200


@gallery_bp.route('/<config_id>/unsave', methods=['POST'])
@jwt_required()
@active_user_required
def unsave_config(config_id):
    """Remove a config from user's saved collection"""
    user = get_current_user()
    user_id = str(user['_id'])

    UserModel.remove_saved_config(user_id, config_id)

    return jsonify({
        'message': 'Config removed from your collection'
    }), 200


@gallery_bp.route('/<config_id>/use', methods=['POST'])
@jwt_required()
@active_user_required
def use_config(config_id):
    """
    Use a config (creates a copy for the user)
    Used when starting a new chat with a gallery/template config
    """
    user = get_current_user()
    user_id = str(user['_id'])

    config = LLMConfigModel.find_by_id(config_id)
    if not config or config['visibility'] not in ['public', 'template']:
        return jsonify({'error': 'Config not found'}), 404

    # Increment uses count
    LLMConfigModel.increment_uses(config_id)

    # Create a copy for the user
    user_config = LLMConfigModel.duplicate(config_id, user_id, config['name'])

    return jsonify({
        'config': serialize_doc(user_config),
        'message': 'Config copied to your collection'
    }), 200


@gallery_bp.route('/saved', methods=['GET'])
@jwt_required()
@active_user_required
def get_saved_configs():
    """Get user's saved configs from gallery"""
    user = get_current_user()
    saved_ids = user.get('saved_configs', [])

    if not saved_ids:
        return jsonify({'configs': []}), 200

    # Fetch the saved configs
    from app.extensions import mongo
    from bson import ObjectId

    configs = list(mongo.db.llm_configs.find({
        '_id': {'$in': [ObjectId(id) if isinstance(id, str) else id for id in saved_ids]},
        'visibility': {'$in': ['public', 'template']}
    }))

    return jsonify({
        'configs': serialize_doc(configs)
    }), 200
