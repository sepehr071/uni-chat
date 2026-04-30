from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.folder import FolderModel, NULL_PROJECT_SENTINEL
from app.models.conversation import ConversationModel
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.decorators import active_user_required
from app.utils.permissions import check_project_access

folders_bp = Blueprint('folders', __name__)


def _resolve_project_filter(raw):
    """Translate the ?project_id= query value into the model layer's filter form.

    Returns a tuple (filter_value, error_response_or_None).
        filter_value is one of:
            None                    -> no filter
            NULL_PROJECT_SENTINEL   -> "where project_id is null/missing"
            <str ObjectId>          -> exact match (validated)
        error_response_or_None: a (jsonify, status) tuple if the value was
        malformed, otherwise None.
    """
    if raw is None or raw == '':
        return None, None
    if raw == 'null':
        return NULL_PROJECT_SENTINEL, None
    if not validate_object_id(raw):
        return None, (jsonify({'error': 'Invalid project_id'}), 400)
    return raw, None


@folders_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def get_folders():
    """Get user's folders.

    Optional `?project_id=<id|null>` filters to a specific project (or to
    folders with no project when 'null'). Real project IDs are gated by
    `check_project_access(viewer)`.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    raw_project = request.args.get('project_id')
    project_filter, err = _resolve_project_filter(raw_project)
    if err:
        return err
    if project_filter and project_filter != NULL_PROJECT_SENTINEL:
        if not check_project_access(user_id, project_filter, 'viewer'):
            return jsonify({'error': 'Project access denied', 'status': 403}), 403

    folders = FolderModel.find_all_by_user(user_id, project_id=project_filter)

    return jsonify({
        'folders': serialize_doc(folders)
    }), 200


@folders_bp.route('/tree', methods=['GET'])
@jwt_required()
@active_user_required
def get_folder_tree():
    """Get folders as a tree structure"""
    user = get_current_user()
    user_id = str(user['_id'])

    folders = FolderModel.find_all_by_user(user_id)

    # Build tree structure
    def build_tree(parent_id=None):
        children = []
        for folder in folders:
            folder_parent = folder.get('parent_id')
            if folder_parent == parent_id or (parent_id is None and folder_parent is None):
                folder_dict = serialize_doc(folder)
                folder_dict['children'] = build_tree(folder['_id'])
                children.append(folder_dict)
        return sorted(children, key=lambda x: x.get('order', 0))

    tree = build_tree()

    return jsonify({
        'tree': tree
    }), 200


@folders_bp.route('', methods=['POST'])
@jwt_required()
@active_user_required
def create_folder():
    """Create a new folder. Accepts optional `project_id` in body."""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Folder name is required'}), 400

    if len(name) > 100:
        return jsonify({'error': 'Folder name too long'}), 400

    project_id = data.get('project_id')
    if project_id:
        if not validate_object_id(project_id):
            return jsonify({'error': 'Invalid project_id'}), 400
        if not check_project_access(user_id, project_id, 'editor'):
            return jsonify({'error': 'Project access denied', 'status': 403}), 403

    folder = FolderModel.create(
        user_id=user_id,
        name=name,
        color=data.get('color', '#5c9aed'),
        icon=data.get('icon'),
        parent_id=data.get('parent_id'),
        project_id=project_id
    )

    return jsonify({
        'folder': serialize_doc(folder)
    }), 201


@folders_bp.route('/<folder_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_folder(folder_id):
    """Get a specific folder"""
    user = get_current_user()
    user_id = str(user['_id'])

    folder = FolderModel.find_by_id(folder_id)
    if not folder or str(folder['user_id']) != user_id:
        return jsonify({'error': 'Folder not found'}), 404

    # Get conversations in this folder
    conversations = ConversationModel.find_by_user(
        user_id=user_id,
        folder_id=folder_id
    )

    return jsonify({
        'folder': serialize_doc(folder),
        'conversations': serialize_doc(conversations)
    }), 200


@folders_bp.route('/<folder_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_folder(folder_id):
    """Update a folder"""
    user = get_current_user()
    user_id = str(user['_id'])

    folder = FolderModel.find_by_id(folder_id)
    if not folder or str(folder['user_id']) != user_id:
        return jsonify({'error': 'Folder not found'}), 404

    data = request.get_json(silent=True) or {}
    update_fields = {}

    if 'name' in data:
        name = data['name'].strip()
        if not name:
            return jsonify({'error': 'Folder name is required'}), 400
        if len(name) > 100:
            return jsonify({'error': 'Folder name too long'}), 400
        update_fields['name'] = name

    if 'color' in data:
        update_fields['color'] = data['color']

    if 'icon' in data:
        update_fields['icon'] = data['icon']

    if 'parent_id' in data:
        # Prevent circular references
        new_parent = data['parent_id']
        if new_parent:
            parent = FolderModel.find_by_id(new_parent)
            if not parent or str(parent['user_id']) != user_id:
                return jsonify({'error': 'Parent folder not found'}), 404
            # Check for circular reference
            if str(folder['_id']) == new_parent:
                return jsonify({'error': 'Cannot set folder as its own parent'}), 400
        update_fields['parent_id'] = new_parent

    if update_fields:
        FolderModel.update(folder_id, update_fields)

    updated = FolderModel.find_by_id(folder_id)
    return jsonify({
        'folder': serialize_doc(updated)
    }), 200


@folders_bp.route('/<folder_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_folder(folder_id):
    """Delete a folder (moves conversations to root)"""
    user = get_current_user()
    user_id = str(user['_id'])

    folder = FolderModel.find_by_id(folder_id)
    if not folder or str(folder['user_id']) != user_id:
        return jsonify({'error': 'Folder not found'}), 404

    # Move all conversations in this folder to root
    from app.extensions import mongo
    from bson import ObjectId

    mongo.db.conversations.update_many(
        {'folder_id': ObjectId(folder_id)},
        {'$set': {'folder_id': None}}
    )

    # Move child folders to root
    mongo.db.folders.update_many(
        {'parent_id': ObjectId(folder_id)},
        {'$set': {'parent_id': None}}
    )

    # Delete the folder
    FolderModel.delete(folder_id)

    return jsonify({'message': 'Folder deleted'}), 200


@folders_bp.route('/reorder', methods=['PUT'])
@jwt_required()
@active_user_required
def reorder_folders():
    """Reorder folders"""
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    folder_orders = data.get('orders', [])
    if not folder_orders:
        return jsonify({'error': 'No order data provided'}), 400

    FolderModel.reorder(user_id, folder_orders)

    return jsonify({'message': 'Folders reordered'}), 200
