from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required
from app.services.openrouter_service import OpenRouterService
from app.utils.decorators import active_user_required
from functools import lru_cache
import time

models_bp = Blueprint('models', __name__)

# Cache for models list (expires after 1 hour)
_models_cache = {
    'data': None,
    'timestamp': 0
}
CACHE_DURATION = 3600  # 1 hour


def get_cached_models():
    """Get models with caching"""
    current_time = time.time()

    if (_models_cache['data'] is None or
        current_time - _models_cache['timestamp'] > CACHE_DURATION):
        # Refresh cache
        models = OpenRouterService.get_available_models()
        _models_cache['data'] = models
        _models_cache['timestamp'] = current_time

    return _models_cache['data']


@models_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def get_models():
    """Get list of available OpenRouter models"""
    models = get_cached_models()

    # Format for frontend
    formatted_models = []
    for model in models:
        formatted_models.append({
            'id': model.get('id'),
            'name': model.get('name'),
            'description': model.get('description', ''),
            'context_length': model.get('context_length', 4096),
            'pricing': {
                'prompt': model.get('pricing', {}).get('prompt', '0'),
                'completion': model.get('pricing', {}).get('completion', '0')
            },
            'top_provider': model.get('top_provider', {}),
            'architecture': model.get('architecture', {})
        })

    # Sort by name
    formatted_models.sort(key=lambda x: x['name'])

    return jsonify({
        'models': formatted_models,
        'count': len(formatted_models)
    }), 200


@models_bp.route('/<path:model_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_model(model_id):
    """Get details for a specific model"""
    models = get_cached_models()

    for model in models:
        if model.get('id') == model_id:
            return jsonify({
                'model': {
                    'id': model.get('id'),
                    'name': model.get('name'),
                    'description': model.get('description', ''),
                    'context_length': model.get('context_length', 4096),
                    'pricing': model.get('pricing', {}),
                    'top_provider': model.get('top_provider', {}),
                    'architecture': model.get('architecture', {}),
                    'per_request_limits': model.get('per_request_limits', {})
                }
            }), 200

    return jsonify({'error': 'Model not found'}), 404


@models_bp.route('/refresh', methods=['POST'])
@jwt_required()
@active_user_required
def refresh_models():
    """Force refresh the models cache"""
    global _models_cache
    _models_cache = {
        'data': None,
        'timestamp': 0
    }

    models = get_cached_models()

    return jsonify({
        'message': 'Models cache refreshed',
        'count': len(models)
    }), 200


@models_bp.route('/categories', methods=['GET'])
@jwt_required()
@active_user_required
def get_model_categories():
    """Get models grouped by provider/category"""
    models = get_cached_models()

    categories = {}
    for model in models:
        model_id = model.get('id', '')
        # Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
        provider = model_id.split('/')[0] if '/' in model_id else 'other'

        if provider not in categories:
            categories[provider] = []

        categories[provider].append({
            'id': model.get('id'),
            'name': model.get('name'),
            'context_length': model.get('context_length', 4096)
        })

    # Sort models within each category
    for provider in categories:
        categories[provider].sort(key=lambda x: x['name'])

    return jsonify({
        'categories': categories
    }), 200
