from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.knowledge_item import KnowledgeItemModel
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.decorators import active_user_required

knowledge_bp = Blueprint('knowledge', __name__)


@knowledge_bp.route('/list', methods=['GET'])
@jwt_required()
@active_user_required
def list_knowledge_items():
    """
    List user's knowledge items with pagination and filtering.

    Query params:
        page: Page number (default 1)
        limit: Items per page (default 20, max 100)
        tag: Filter by tag
        favorite: If 'true', only return favorites
        search: Search query (optional)
    """
    user = get_current_user()
    user_id = str(user['_id'])

    page = max(1, int(request.args.get('page', 1)))
    limit = min(100, max(1, int(request.args.get('limit', 20))))
    tag = request.args.get('tag', '').strip() or None
    favorite_only = request.args.get('favorite', '').lower() == 'true'
    search = request.args.get('search', '').strip() or None
    folder_id = request.args.get('folder_id', '').strip() or None

    # If search is provided, use search method instead
    if search:
        items, total = KnowledgeItemModel.search(user_id, search, page=page, limit=limit)
    else:
        items, total = KnowledgeItemModel.find_by_user(
            user_id,
            page=page,
            limit=limit,
            tag=tag,
            favorite_only=favorite_only,
            folder_id=folder_id
        )

    return jsonify({
        'items': serialize_doc(items),
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': (total + limit - 1) // limit,
        'has_more': (page * limit) < total
    }), 200


# IMPORTANT: Static routes MUST come before dynamic /<item_id> routes
# Otherwise Flask will match /search as /<item_id> with item_id="search"

@knowledge_bp.route('/search', methods=['GET'])
@jwt_required()
@active_user_required
def search_knowledge():
    """
    Full-text search on knowledge items.

    Query params:
        q: Search query (required)
        page: Page number (default 1)
        limit: Items per page (default 20, max 100)
    """
    user = get_current_user()
    user_id = str(user['_id'])

    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query is required'}), 400

    if len(query) > 200:
        return jsonify({'error': 'Query too long (max 200 characters)'}), 400

    page = max(1, int(request.args.get('page', 1)))
    limit = min(100, max(1, int(request.args.get('limit', 20))))

    items, total = KnowledgeItemModel.search(user_id, query, page=page, limit=limit)

    return jsonify({
        'items': serialize_doc(items),
        'total': total,
        'page': page,
        'limit': limit,
        'query': query,
        'has_more': (page * limit) < total
    }), 200


@knowledge_bp.route('/tags', methods=['GET'])
@jwt_required()
@active_user_required
def get_user_tags():
    """Get all distinct tags used by the current user."""
    user = get_current_user()
    user_id = str(user['_id'])

    tags = KnowledgeItemModel.get_user_tags(user_id)

    return jsonify({
        'tags': sorted(tags)
    }), 200


# Dynamic routes with <item_id> parameter

@knowledge_bp.route('/<item_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_knowledge_item(item_id):
    """Get a single knowledge item by ID."""
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(item_id):
        return jsonify({'error': 'Invalid item ID'}), 400

    item = KnowledgeItemModel.find_by_id(item_id)
    if not item or str(item.get('user_id')) != user_id:
        return jsonify({'error': 'Item not found'}), 404

    return jsonify({
        'item': serialize_doc(item)
    }), 200


@knowledge_bp.route('', methods=['POST'])
@jwt_required()
@active_user_required
def create_knowledge_item():
    """
    Create a new knowledge item.

    Body:
        source_type: 'chat' | 'arena' | 'debate' (required)
        source_id: conversation_id or session_id (required)
        message_id: ID of the source message (required)
        content: The content to save (required)
        title: Title for the item (required)
        tags: Array of tag strings (optional)
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    # Validate required fields
    source_type = data.get('source_type', '').strip()
    if source_type not in ('chat', 'arena', 'debate'):
        return jsonify({'error': 'Invalid source_type. Must be chat, arena, or debate'}), 400

    source_id = data.get('source_id', '').strip()
    if not source_id or not validate_object_id(source_id):
        return jsonify({'error': 'Invalid or missing source_id'}), 400

    message_id = data.get('message_id', '').strip()
    if not message_id or not validate_object_id(message_id):
        return jsonify({'error': 'Invalid or missing message_id'}), 400

    content = data.get('content', '').strip()
    if not content:
        return jsonify({'error': 'Content is required'}), 400

    if len(content) > 50000:
        return jsonify({'error': 'Content too long (max 50000 characters)'}), 400

    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    if len(title) > 200:
        return jsonify({'error': 'Title too long (max 200 characters)'}), 400

    # Validate tags
    tags = data.get('tags', [])
    if not isinstance(tags, list):
        return jsonify({'error': 'Tags must be an array'}), 400

    # Clean and validate tags
    tags = [str(t).strip().lower() for t in tags if t and str(t).strip()]
    tags = list(set(tags))[:20]  # Dedupe and limit to 20 tags

    item = KnowledgeItemModel.create(
        user_id=user_id,
        source_type=source_type,
        source_id=source_id,
        message_id=message_id,
        content=content,
        title=title,
        tags=tags
    )

    return jsonify({
        'item': serialize_doc(item)
    }), 201


@knowledge_bp.route('/<item_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_knowledge_item(item_id):
    """
    Update a knowledge item.

    Body (all optional):
        title: New title
        tags: New tags array
        notes: Personal notes
        is_favorite: Boolean
    """
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(item_id):
        return jsonify({'error': 'Invalid item ID'}), 400

    data = request.get_json()
    updates = {}

    if 'title' in data:
        title = data['title'].strip() if data['title'] else ''
        if not title:
            return jsonify({'error': 'Title cannot be empty'}), 400
        if len(title) > 200:
            return jsonify({'error': 'Title too long (max 200 characters)'}), 400
        updates['title'] = title

    if 'tags' in data:
        tags = data['tags']
        if not isinstance(tags, list):
            return jsonify({'error': 'Tags must be an array'}), 400
        tags = [str(t).strip().lower() for t in tags if t and str(t).strip()]
        tags = list(set(tags))[:20]
        updates['tags'] = tags

    if 'notes' in data:
        notes = data['notes'] if data['notes'] else ''
        if len(notes) > 5000:
            return jsonify({'error': 'Notes too long (max 5000 characters)'}), 400
        updates['notes'] = notes

    if 'is_favorite' in data:
        updates['is_favorite'] = bool(data['is_favorite'])

    if 'folder_id' in data:
        folder_id = data['folder_id']
        if folder_id:
            if not validate_object_id(folder_id):
                return jsonify({'error': 'Invalid folder ID'}), 400
        updates['folder_id'] = folder_id  # Can be None to move to root

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    success = KnowledgeItemModel.update(item_id, user_id, updates)
    if not success:
        return jsonify({'error': 'Item not found'}), 404

    item = KnowledgeItemModel.find_by_id(item_id)
    return jsonify({
        'item': serialize_doc(item)
    }), 200


@knowledge_bp.route('/<item_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_knowledge_item(item_id):
    """Delete a knowledge item."""
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(item_id):
        return jsonify({'error': 'Invalid item ID'}), 400

    success = KnowledgeItemModel.delete(item_id, user_id)
    if not success:
        return jsonify({'error': 'Item not found'}), 404

    return jsonify({'message': 'Item deleted'}), 200


@knowledge_bp.route('/move', methods=['PUT'])
@jwt_required()
@active_user_required
def move_items_to_folder():
    """
    Move multiple items to a folder.

    Body:
        item_ids: Array of item IDs to move
        folder_id: Target folder ID (null/empty for root)
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    item_ids = data.get('item_ids', [])
    if not item_ids or not isinstance(item_ids, list):
        return jsonify({'error': 'item_ids array is required'}), 400

    # Validate all item IDs
    for item_id in item_ids:
        if not validate_object_id(item_id):
            return jsonify({'error': 'Invalid item ID in list'}), 400

    folder_id = data.get('folder_id')
    if folder_id and not validate_object_id(folder_id):
        return jsonify({'error': 'Invalid folder ID'}), 400

    moved_count = KnowledgeItemModel.move_to_folder(item_ids, user_id, folder_id)

    return jsonify({
        'message': f'Moved {moved_count} items',
        'moved_count': moved_count
    }), 200
