from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

from app.models.openrouter_model import OpenRouterModelDoc
from app.services.model_registry_service import ModelRegistryService
from app.utils.decorators import admin_required
from app.utils.quick_models import QUICK_MODELS

model_catalog_bp = Blueprint('model_catalog', __name__)


@model_catalog_bp.route('/quick-models', methods=['GET'])
@jwt_required()
def list_quick_models():
    """Return the canonical quick-models registry (id + display name) for frontend boot."""
    return jsonify({
        'models': [
            {'id': model_id, 'name': display_name}
            for model_id, display_name in QUICK_MODELS.items()
        ]
    }), 200


def _serialize_doc(doc: dict) -> dict:
    """Convert any ObjectId/datetime fields for JSON output."""
    if not doc:
        return doc
    result = dict(doc)
    # _id is a plain string for this collection — no ObjectId conversion needed.
    if 'last_synced_at' in result and result['last_synced_at']:
        result['last_synced_at'] = result['last_synced_at'].isoformat()
    # Strip raw field from list responses to keep payload small
    result.pop('raw', None)
    return result


@model_catalog_bp.route('/catalog/refresh-status', methods=['GET'])
@jwt_required()
def refresh_status():
    """Return registry metadata: last sync time, count, staleness flag."""
    last_synced_at = OpenRouterModelDoc.get_last_sync_at()
    count = OpenRouterModelDoc.count()
    registry = ModelRegistryService()
    return jsonify({
        'last_synced_at': last_synced_at.isoformat() if last_synced_at else None,
        'count': count,
        'is_stale': registry.is_stale(),
        'has_models': count > 0,
    }), 200


@model_catalog_bp.route('/catalog/refresh', methods=['POST'])
@admin_required
def refresh_catalog():
    """Trigger a synchronous model registry refresh from OpenRouter. Admin only."""
    registry = ModelRegistryService()
    result = registry.refresh()
    if 'error' in result:
        return jsonify({'error': result['error']}), 502
    return jsonify(result), 200


@model_catalog_bp.route('/catalog', methods=['GET'])
@jwt_required()
def list_catalog():
    """List models from the local registry with optional filtering and pagination.

    Query params:
      modality    — filter by output modality: image | audio | text | video
      capability  — filter by a supported_parameter value
      sort        — newest | price | context  (default: newest)
      page        — 1-based page number (default: 1)
      page_size   — items per page (default: 50, max 200)
    """
    modality = request.args.get('modality')
    capability = request.args.get('capability')
    sort = request.args.get('sort', 'newest')
    page = max(1, int(request.args.get('page', 1)))
    page_size = min(200, max(1, int(request.args.get('page_size', 50))))

    sort_map = {
        'newest': ('created', -1),
        'price': ('pricing.prompt', 1),
        'context': ('context_length', -1),
    }
    sort_by, sort_dir = sort_map.get(sort, ('created', -1))

    # Filtered queries
    if modality:
        docs = OpenRouterModelDoc.find_by_modality(output_modalities=[modality])
    elif capability:
        docs = OpenRouterModelDoc.find_by_capability(capability)
    else:
        skip = (page - 1) * page_size
        docs = OpenRouterModelDoc.find_all(skip=skip, limit=page_size, sort_by=sort_by, sort_dir=sort_dir)
        total = OpenRouterModelDoc.count()
        return jsonify({
            'data': [_serialize_doc(d) for d in docs],
            'total': total,
            'page': page,
            'page_size': page_size,
        }), 200

    # For filtered queries, apply pagination in Python (result set is bounded)
    total = len(docs)
    skip = (page - 1) * page_size
    docs = docs[skip: skip + page_size]

    return jsonify({
        'data': [_serialize_doc(d) for d in docs],
        'total': total,
        'page': page,
        'page_size': page_size,
    }), 200


@model_catalog_bp.route('/catalog/<path:model_id>', methods=['GET'])
@jwt_required()
def get_catalog_model(model_id: str):
    """Return a single model doc plus lazy-loaded endpoint data.

    Uses <path:> converter so slashes in the model id (e.g. 'openai/gpt-4o')
    pass through correctly.
    """
    registry = ModelRegistryService()
    doc = registry.get(model_id)
    if not doc:
        return jsonify({'error': 'model not found'}), 404

    result = dict(doc)
    if 'last_synced_at' in result and result['last_synced_at']:
        result['last_synced_at'] = result['last_synced_at'].isoformat()

    # Attach endpoints lazily
    endpoints = registry.get_endpoints(model_id)
    result['endpoints'] = endpoints

    return jsonify(result), 200
