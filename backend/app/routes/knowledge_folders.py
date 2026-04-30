from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.knowledge_folder import KnowledgeFolderModel, NULL_PROJECT_SENTINEL
from app.models.knowledge_item import KnowledgeItemModel
from app.models.project import ProjectModel
from app.utils.helpers import serialize_doc, validate_object_id
from app.utils.decorators import active_user_required
from app.utils.permissions import check_project_access

knowledge_folders_bp = Blueprint('knowledge_folders', __name__)


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


@knowledge_folders_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def list_folders():
    """List knowledge folders for the current user.

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

    folders = KnowledgeFolderModel.find_by_user(user_id, project_id=project_filter)

    # Add item counts for each folder
    for folder in folders:
        folder['item_count'] = KnowledgeItemModel.count_by_folder(user_id, str(folder['_id']))

    # Also get count of unfiled items (scoped to whichever filter is active)
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
        project_id: Optional project to scope this folder to. When set,
            workspace_id is auto-derived from the project. Caller must
            hold at least 'editor' on the project.
        workspace_id: Optional explicit workspace_id (rare — usually
            derived). Ignored when project_id is set.
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Folder name is required'}), 400

    if len(name) > 100:
        return jsonify({'error': 'Folder name too long (max 100 characters)'}), 400

    project_id = data.get('project_id') or None
    workspace_id = data.get('workspace_id') or None

    if project_id:
        if not validate_object_id(project_id):
            return jsonify({'error': 'Invalid project_id'}), 400
        if not check_project_access(user_id, project_id, 'editor'):
            return jsonify({'error': 'Project access denied', 'status': 403}), 403
        # Derive workspace_id from the project — overrides any passed value.
        project = ProjectModel.find_by_id(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        workspace_id = project['workspace_id']
    elif workspace_id:
        if not validate_object_id(workspace_id):
            return jsonify({'error': 'Invalid workspace_id'}), 400

    # Pre-flight duplicate name check under the same scope.
    existing_folders = KnowledgeFolderModel.find_by_user(
        user_id,
        project_id=(project_id if project_id else NULL_PROJECT_SENTINEL),
    )
    if any(f['name'].lower() == name.lower() for f in existing_folders):
        return jsonify({'error': 'A folder with this name already exists'}), 400

    color = data.get('color', '#5c9aed')
    if not color.startswith('#') or len(color) != 7:
        color = '#5c9aed'

    folder = KnowledgeFolderModel.create(
        user_id,
        name,
        color,
        project_id=project_id,
        workspace_id=workspace_id,
    )

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

    Notes:
        project_id is intentionally NOT mutable post-create. Sending one
        returns 400 cannot_reassign_project.
    """
    user = get_current_user()
    user_id = str(user['_id'])

    if not validate_object_id(folder_id):
        return jsonify({'error': 'Invalid folder ID'}), 400

    data = request.get_json(silent=True) or {}

    if 'project_id' in data:
        return jsonify({
            'error': 'Cannot reassign folder to a different project',
            'code': 'cannot_reassign_project'
        }), 400

    updates = {}

    if 'name' in data:
        name = data['name'].strip() if data['name'] else ''
        if not name:
            return jsonify({'error': 'Folder name cannot be empty'}), 400
        if len(name) > 100:
            return jsonify({'error': 'Folder name too long (max 100 characters)'}), 400
        updates['name'] = name

    if 'color' in data:
        color = data['color']
        if color and color.startswith('#') and len(color) == 7:
            updates['color'] = color

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    try:
        success = KnowledgeFolderModel.update(folder_id, user_id, updates)
    except ValueError as e:
        code = str(e)
        if code == 'duplicate_name':
            return jsonify({
                'error': 'A folder with this name already exists',
                'code': 'duplicate_name'
            }), 400
        if code == 'cannot_reassign_project':
            return jsonify({
                'error': 'Cannot reassign folder to a different project',
                'code': 'cannot_reassign_project'
            }), 400
        return jsonify({'error': code}), 400

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
    data = request.get_json(silent=True) or {}

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
