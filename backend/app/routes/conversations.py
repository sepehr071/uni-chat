from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from datetime import datetime
import json
import uuid
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

    # Get branch_id from query params, default to active branch
    branch_id = request.args.get('branch_id', conversation.get('active_branch', 'main'))

    # Get messages for the specified branch
    messages = MessageModel.find_by_conversation(conversation_id, branch_id=branch_id)

    return jsonify({
        'conversation': serialize_doc(conversation),
        'messages': serialize_doc(messages),
        'active_branch': conversation.get('active_branch', 'main')
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


@conversations_bp.route('/search/messages', methods=['GET'])
@jwt_required()
@active_user_required
def search_messages():
    """Search within message content across all user's conversations"""
    user = get_current_user()
    user_id = str(user['_id'])

    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query required'}), 400

    limit = min(int(request.args.get('limit', 50)), 100)

    # Get all user's conversation IDs
    conversations = ConversationModel.find_by_user(user_id=user_id, limit=1000)
    conversation_ids = [str(c['_id']) for c in conversations]

    if not conversation_ids:
        return jsonify({
            'results': [],
            'query': query,
            'total': 0
        }), 200

    # Search messages
    results = MessageModel.search_in_conversations(
        user_conversation_ids=conversation_ids,
        query=query,
        limit=limit
    )

    return jsonify({
        'results': serialize_doc(results),
        'query': query,
        'total': len(results)
    }), 200


@conversations_bp.route('/<conversation_id>/export', methods=['GET'])
@jwt_required()
@active_user_required
def export_conversation(conversation_id):
    """Export conversation in JSON or Markdown format"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Get format from query params (default to markdown)
    export_format = request.args.get('format', 'markdown').lower()
    include_metadata = request.args.get('metadata', 'true').lower() == 'true'

    # Get all messages
    messages = MessageModel.find_by_conversation(conversation_id)

    if export_format == 'json':
        return _export_as_json(conversation, messages, include_metadata)
    else:
        return _export_as_markdown(conversation, messages, include_metadata)


def _export_as_json(conversation, messages, include_metadata):
    """Export conversation as JSON"""
    export_data = {
        'exported_at': datetime.utcnow().isoformat(),
        'conversation': {
            'id': str(conversation['_id']),
            'title': conversation.get('title', 'Untitled'),
            'created_at': conversation.get('created_at', '').isoformat() if conversation.get('created_at') else None,
            'message_count': conversation.get('message_count', len(messages)),
            'tags': conversation.get('tags', []),
        },
        'messages': []
    }

    for msg in messages:
        message_data = {
            'role': msg['role'],
            'content': msg['content'],
            'created_at': msg.get('created_at', '').isoformat() if msg.get('created_at') else None,
        }

        if include_metadata and msg.get('metadata'):
            message_data['metadata'] = {
                'model': msg['metadata'].get('model_id'),
                'tokens': msg['metadata'].get('tokens'),
            }

        if msg.get('is_edited'):
            message_data['edited'] = True

        export_data['messages'].append(message_data)

    filename = f"conversation_{conversation.get('title', 'export')[:30]}_{datetime.utcnow().strftime('%Y%m%d')}.json"
    filename = filename.replace(' ', '_').replace('/', '-')

    return Response(
        json.dumps(export_data, indent=2, default=str),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


def _export_as_markdown(conversation, messages, include_metadata):
    """Export conversation as Markdown"""
    title = conversation.get('title', 'Untitled Conversation')
    created_at = conversation.get('created_at')

    lines = [
        f"# {title}",
        "",
    ]

    if include_metadata:
        lines.extend([
            f"**Exported:** {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}",
            f"**Messages:** {conversation.get('message_count', len(messages))}",
        ])
        if created_at:
            lines.append(f"**Created:** {created_at.strftime('%B %d, %Y')}")
        if conversation.get('tags'):
            lines.append(f"**Tags:** {', '.join(conversation['tags'])}")
        lines.extend(["", "---", ""])

    for msg in messages:
        role = msg['role'].capitalize()
        content = msg['content']
        timestamp = msg.get('created_at')

        if role == 'User':
            lines.append(f"## User")
        elif role == 'Assistant':
            lines.append(f"## Assistant")
        else:
            lines.append(f"## {role}")

        if include_metadata and timestamp:
            lines.append(f"*{timestamp.strftime('%Y-%m-%d %H:%M')}*")

        lines.append("")
        lines.append(content)
        lines.append("")

        if include_metadata and msg.get('metadata') and msg['metadata'].get('model_id'):
            model_name = msg['metadata']['model_id'].split('/')[-1]
            tokens = msg['metadata'].get('tokens', {})
            if tokens.get('completion'):
                lines.append(f"> *Model: {model_name} | Tokens: {tokens['completion']}*")
            else:
                lines.append(f"> *Model: {model_name}*")
            lines.append("")

        lines.append("---")
        lines.append("")

    filename = f"conversation_{title[:30]}_{datetime.utcnow().strftime('%Y%m%d')}.md"
    filename = filename.replace(' ', '_').replace('/', '-')

    return Response(
        '\n'.join(lines),
        mimetype='text/markdown',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


# ==================== Branch Management Routes ====================

@conversations_bp.route('/<conversation_id>/branch/<message_id>', methods=['POST'])
@jwt_required()
@active_user_required
def create_branch(conversation_id, message_id):
    """Create a new branch from a specific message"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Verify message exists and belongs to this conversation
    message = MessageModel.find_by_id(message_id)
    if not message or str(message['conversation_id']) != conversation_id:
        return jsonify({'error': 'Message not found'}), 404

    data = request.get_json() or {}
    branch_name = data.get('name')

    # Generate unique branch ID
    branch_id = str(uuid.uuid4())[:12]

    # Get the branch the message belongs to (source branch)
    source_branch = message.get('branch_id', 'main')

    # Create branch data
    branch_data = {
        'id': branch_id,
        'name': branch_name or f"Branch from message",
        'parent_branch': source_branch,
        'branch_point_message_id': str(message['_id'])
    }

    # Add branch to conversation
    if not ConversationModel.add_branch(conversation_id, branch_data):
        return jsonify({'error': 'Failed to create branch'}), 500

    # Copy all messages up to and including the branch point to the new branch
    messages_to_copy = MessageModel.find_up_to(conversation_id, message_id, source_branch)

    copied_messages = []
    for msg in messages_to_copy:
        copied_msg = MessageModel.copy_to_branch(msg, branch_id)
        copied_messages.append(copied_msg)

    # Set the new branch as active
    ConversationModel.set_active_branch(conversation_id, branch_id)

    # Get updated conversation
    updated_conversation = ConversationModel.find_by_id(conversation_id)

    return jsonify({
        'branch_id': branch_id,
        'branches': serialize_doc(updated_conversation.get('branches', [])),
        'messages': serialize_doc(copied_messages),
        'active_branch': branch_id
    }), 201


@conversations_bp.route('/<conversation_id>/branches', methods=['GET'])
@jwt_required()
@active_user_required
def list_branches(conversation_id):
    """List all branches for a conversation"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    branches = conversation.get('branches', [{'id': 'main', 'name': 'Main'}])
    active_branch = conversation.get('active_branch', 'main')

    return jsonify({
        'branches': serialize_doc(branches),
        'active_branch': active_branch
    }), 200


@conversations_bp.route('/<conversation_id>/branch/<branch_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def switch_branch(conversation_id, branch_id):
    """Switch to a different branch"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Verify branch exists
    branch = ConversationModel.get_branch(conversation_id, branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    # Set active branch
    if not ConversationModel.set_active_branch(conversation_id, branch_id):
        return jsonify({'error': 'Failed to switch branch'}), 500

    # Get messages for the new branch
    messages = MessageModel.find_by_conversation(conversation_id, branch_id=branch_id)

    return jsonify({
        'active_branch': branch_id,
        'messages': serialize_doc(messages)
    }), 200


@conversations_bp.route('/<conversation_id>/branch/<branch_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_branch(conversation_id, branch_id):
    """Delete a branch (cannot delete 'main')"""
    user = get_current_user()
    user_id = str(user['_id'])

    if branch_id == 'main':
        return jsonify({'error': 'Cannot delete the main branch'}), 400

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Verify branch exists
    branch = ConversationModel.get_branch(conversation_id, branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    # Delete all messages in the branch
    MessageModel.delete_by_branch(conversation_id, branch_id)

    # Remove branch from conversation
    if not ConversationModel.remove_branch(conversation_id, branch_id):
        return jsonify({'error': 'Failed to delete branch'}), 500

    return jsonify({'success': True}), 200


@conversations_bp.route('/<conversation_id>/branch/<branch_id>/rename', methods=['PUT'])
@jwt_required()
@active_user_required
def rename_branch(conversation_id, branch_id):
    """Rename a branch"""
    user = get_current_user()
    user_id = str(user['_id'])

    if branch_id == 'main':
        return jsonify({'error': 'Cannot rename the main branch'}), 400

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    # Verify branch exists
    branch = ConversationModel.get_branch(conversation_id, branch_id)
    if not branch:
        return jsonify({'error': 'Branch not found'}), 404

    data = request.get_json() or {}
    new_name = data.get('name', '').strip()

    if not new_name:
        return jsonify({'error': 'Branch name is required'}), 400

    if len(new_name) > 50:
        return jsonify({'error': 'Branch name too long (max 50 characters)'}), 400

    # Update the branch name
    if not ConversationModel.update_branch_name(conversation_id, branch_id, new_name):
        return jsonify({'error': 'Failed to rename branch'}), 500

    return jsonify({
        'success': True,
        'branch': {
            'id': branch_id,
            'name': new_name
        }
    }), 200
