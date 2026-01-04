from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.utils.helpers import serialize_doc
from app.utils.decorators import active_user_required

conversations_bp = Blueprint('conversations', __name__)


@conversations_bp.route('', methods=['GET'])
@jwt_required()
@active_user_required
def get_conversations():
    """Get user's conversations"""
    user = get_current_user()
    user_id = str(user['_id'])

    folder_id = request.args.get('folder_id')
    archived = request.args.get('archived', 'false').lower() == 'true'
    search = request.args.get('search')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    sort_by = request.args.get('sort', 'last_message_at')

    skip = (page - 1) * limit

    conversations = ConversationModel.find_by_user(
        user_id=user_id,
        folder_id=folder_id,
        archived=archived,
        search=search,
        skip=skip,
        limit=limit,
        sort_by=sort_by
    )

    total = ConversationModel.count_by_user(user_id, archived=archived)

    return jsonify({
        'conversations': serialize_doc(conversations),
        'total': total,
        'page': page,
        'limit': limit,
        'has_more': skip + len(conversations) < total
    }), 200


@conversations_bp.route('/<conversation_id>', methods=['GET'])
@jwt_required()
@active_user_required
def get_conversation(conversation_id):
    """Get a specific conversation with messages"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Get messages
    messages = MessageModel.find_by_conversation(conversation_id)

    return jsonify({
        'conversation': serialize_doc(conversation),
        'messages': serialize_doc(messages)
    }), 200


@conversations_bp.route('', methods=['POST'])
@jwt_required()
@active_user_required
def create_conversation():
    """Create a new conversation"""
    user = get_current_user()
    data = request.get_json()

    config_id = data.get('config_id')
    title = data.get('title', 'New conversation')
    folder_id = data.get('folder_id')

    if not config_id:
        return jsonify({'error': 'config_id is required'}), 400

    conversation = ConversationModel.create(
        user_id=str(user['_id']),
        config_id=config_id,
        title=title,
        folder_id=folder_id
    )

    return jsonify({
        'conversation': serialize_doc(conversation)
    }), 201


@conversations_bp.route('/<conversation_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def update_conversation(conversation_id):
    """Update conversation details"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    data = request.get_json()
    update_fields = {}

    if 'title' in data:
        update_fields['title'] = data['title']
    if 'folder_id' in data:
        update_fields['folder_id'] = ObjectId(data['folder_id']) if data['folder_id'] else None
    if 'tags' in data:
        update_fields['tags'] = data['tags']
    if 'is_pinned' in data:
        update_fields['is_pinned'] = data['is_pinned']

    if update_fields:
        ConversationModel.update(conversation_id, update_fields)

    updated = ConversationModel.find_by_id(conversation_id)
    return jsonify({
        'conversation': serialize_doc(updated)
    }), 200


@conversations_bp.route('/<conversation_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_conversation(conversation_id):
    """Delete a conversation and its messages"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Delete all messages
    MessageModel.delete_by_conversation(conversation_id)

    # Delete conversation
    ConversationModel.delete(conversation_id)

    return jsonify({'message': 'Conversation deleted'}), 200


@conversations_bp.route('/<conversation_id>/archive', methods=['POST'])
@jwt_required()
@active_user_required
def toggle_archive(conversation_id):
    """Archive or unarchive a conversation"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Toggle archive status
    new_status = not conversation.get('is_archived', False)
    ConversationModel.toggle_archive(conversation_id, new_status)

    return jsonify({
        'message': 'Archived' if new_status else 'Unarchived',
        'is_archived': new_status
    }), 200


@conversations_bp.route('/search', methods=['GET'])
@jwt_required()
@active_user_required
def search_conversations():
    """Search conversations"""
    user = get_current_user()
    user_id = str(user['_id'])

    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query required'}), 400

    conversations = ConversationModel.find_by_user(
        user_id=user_id,
        search=query,
        limit=20
    )

    return jsonify({
        'conversations': serialize_doc(conversations),
        'query': query
    }), 200
