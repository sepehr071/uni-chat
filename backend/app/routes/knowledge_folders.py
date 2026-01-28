from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.knowledge_folder import KnowledgeFolderModel
from app.models.knowledge_item import KnowledgeItemModel
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.decorators import active_user_required

knowledge_folders_bp = Blueprint('knowledge_folders', __name__)


@knowledge_folders_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def list_folders():
    """List all knowledge folders for the current user."""
    user = get_current_user()
    user_id = str(user['_id'])

    folders = KnowledgeFolderModel.find_by_user(user_id)

    # Add item counts for each folder
    for folder in folders:
        folder['item_count'] = KnowledgeItemModel.count_by_folder(user_id, str(folder['_id']))

    # Also get count of unfiled items
    unfiled_count = KnowledgeItemModel.count_by_folder(user_id, 'root')

    return jsonify({
        'folders': serialize_doc(folders),
        'unfiled_count': unfiled_count
    }), 200


@knowledge_folders_bp.route('', methods=['POST'])
@jwt_required()
@active_user_required
def create_folder():
    """
    Create a new knowledge folder.

    Body:
        name: Folder name (required, max 100 chars)
        color: Hex color (optional, default #5c9aed)
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Folder name is required'}), 400

    if len(name) > 100:
        return jsonify({'error': 'Folder name too long (max 100 characters)'}), 400

    # Check for duplicate names
    existing_folders = KnowledgeFolderModel.find_by_user(user_id)
    if any(f['name'].lower() == name.lower() for f in existing_folders):
        return jsonify({'error': 'A folder with this name already exists'}), 400

    color = data.get('color', '#5c9aed')
    if not color.startswith('#') or len(color) != 7:
        color = '#5c9aed'

    folder = KnowledgeFolderModel.create(user_id, name, color)

    return jsonify({
        'folder': serialize_doc(folder)
    }), 201


@knowledge_folders_bp.route('/<folder_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_folder(folder_id):
    """Get a single folder with item count."""
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(folder_id):
        return jsonify({'error': 'Invalid folder ID'}), 400

    folder = KnowledgeFolderModel.find_by_id(folder_id)
    if not folder or str(folder.get('user_id')) != user_id:
        return jsonify({'error': 'Folder not found'}), 404

    folder['item_count'] = KnowledgeItemModel.count_by_folder(user_id, folder_id)

    return jsonify({
        'folder': serialize_doc(folder)
    }), 200


@knowledge_folders_bp.route('/<folder_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_folder(folder_id):
    """
    Update a folder.

    Body (all optional):
        name: New folder name
        color: New hex color
    """
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(folder_id):
        return jsonify({'error': 'Invalid folder ID'}), 400

    data = request.get_json()
    updates = {}

    if 'name' in data:
        name = data['name'].strip() if data['name'] else ''
        if not name:
            return jsonify({'error': 'Folder name cannot be empty'}), 400
        if len(name) > 100:
            return jsonify({'error': 'Folder name too long (max 100 characters)'}), 400

        # Check for duplicate names (excluding current folder)
        existing_folders = KnowledgeFolderModel.find_by_user(user_id)
        for f in existing_folders:
            if str(f['_id']) != folder_id and f['name'].lower() == name.lower():
                return jsonify({'error': 'A folder with this name already exists'}), 400

        updates['name'] = name

    if 'color' in data:
        color = data['color']
        if color and color.startswith('#') and len(color) == 7:
            updates['color'] = color

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    success = KnowledgeFolderModel.update(folder_id, user_id, updates)
    if not success:
        return jsonify({'error': 'Folder not found'}), 404

    folder = KnowledgeFolderModel.find_by_id(folder_id)
    return jsonify({
        'folder': serialize_doc(folder)
    }), 200


@knowledge_folders_bp.route('/<folder_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_folder(folder_id):
    """
    Delete a folder. Items in this folder will be moved to root (unfiled).
    """
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(folder_id):
        return jsonify({'error': 'Invalid folder ID'}), 400

    success = KnowledgeFolderModel.delete(folder_id, user_id)
    if not success:
        return jsonify({'error': 'Folder not found'}), 404

    return jsonify({'message': 'Folder deleted'}), 200


@knowledge_folders_bp.route('/reorder', methods=['PUT'])
@jwt_required()
@active_user_required
def reorder_folders():
    """
    Reorder folders.

    Body:
        orders: Array of { folder_id, order } objects
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    orders = data.get('orders', [])
    if not orders or not isinstance(orders, list):
        return jsonify({'error': 'Orders array is required'}), 400

    # Validate all folder IDs
    for item in orders:
        if not item.get('folder_id') or not validate_object_id(item['folder_id']):
            return jsonify({'error': 'Invalid folder ID in orders'}), 400
        if not isinstance(item.get('order'), int):
            return jsonify({'error': 'Order must be an integer'}), 400

    KnowledgeFolderModel.reorder(user_id, orders)

    return jsonify({'message': 'Folders reordered'}), 200
