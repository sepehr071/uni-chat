from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.utils.helpers import serialize_doc, generate_conversation_title
from app.utils.decorators import active_user_required
import time

chat_bp = Blueprint('chat', __name__)


@chat_bp.route('/send', methods=['POST'])
@jwt_required()
@active_user_required
def send_message():
    """
    Send a message and get AI response (non-streaming)
    For streaming, use WebSocket events
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    conversation_id = data.get('conversation_id')
    config_id = data.get('config_id')
    message_content = data.get('message', '').strip()
    attachments = data.get('attachments', [])

    if not message_content:
        return jsonify({'error': 'Message content is required'}), 400

    if not config_id:
        return jsonify({'error': 'config_id is required'}), 400

    # Get config
    config = LLMConfigModel.find_by_id(config_id)
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    # Check token limit
    if user['usage']['tokens_limit'] != -1:
        if user['usage']['tokens_used'] >= user['usage']['tokens_limit']:
            return jsonify({'error': 'Token limit reached'}), 429

    # Create or get conversation
    if conversation_id:
        conversation = ConversationModel.find_by_id(conversation_id)
        if not conversation or str(conversation['user_id']) != user_id:
            return jsonify({'error': 'Conversation not found'}), 404
    else:
        title = generate_conversation_title(message_content)
        conversation = ConversationModel.create(
            user_id=user_id,
            config_id=config_id,
            title=title
        )
        conversation_id = str(conversation['_id'])

    # Get active branch
    branch_id = conversation.get('active_branch', 'main')

    # Save user message
    user_message = MessageModel.create_user_message(
        conversation_id=conversation_id,
        content=message_content,
        attachments=attachments,
        branch_id=branch_id
    )

    # Get context and generate response
    context_messages = MessageModel.get_context_messages(conversation_id, limit=20, branch_id=branch_id)
    formatted_messages = OpenRouterService.format_messages_for_api(context_messages)
    formatted_messages.append({'role': 'user', 'content': message_content})

    start_time = time.time()
    params = config.get('parameters', {})

    # Get user AI preferences and build enhanced system prompt
    ai_prefs = user.get('ai_preferences', {})
    enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
        config.get('system_prompt'),
        ai_prefs
    )

    response = OpenRouterService.chat_completion(
        messages=formatted_messages,
        model=config['model_id'],
        system_prompt=enhanced_prompt,
        temperature=params.get('temperature', 0.7),
        max_tokens=params.get('max_tokens', 2048),
        stream=False
    )

    generation_time_ms = int((time.time() - start_time) * 1000)

    if 'error' in response:
        error_msg = response['error'].get('message', 'Unknown error')
        error_message = MessageModel.create_error_message(
            conversation_id=conversation_id,
            error_message=error_msg,
            model_id=config['model_id'],
            branch_id=branch_id
        )
        return jsonify({
            'error': error_msg,
            'user_message': serialize_doc(user_message),
            'assistant_message': serialize_doc(error_message)
        }), 500

    # Extract response content
    choices = response.get('choices', [])
    content = choices[0]['message']['content'] if choices else ''
    usage = response.get('usage', {})
    prompt_tokens = usage.get('prompt_tokens', 0)
    completion_tokens = usage.get('completion_tokens', 0)
    finish_reason = choices[0].get('finish_reason', 'stop') if choices else 'stop'

    # Save assistant message
    assistant_message = MessageModel.create_assistant_message(
        conversation_id=conversation_id,
        content=content,
        model_id=config['model_id'],
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        generation_time_ms=generation_time_ms,
        finish_reason=finish_reason,
        branch_id=branch_id
    )

    # Update stats
    ConversationModel.increment_message_count(
        conversation_id,
        input_tokens=prompt_tokens,
        output_tokens=completion_tokens
    )
    UserModel.increment_usage(user_id, messages=2, tokens=prompt_tokens + completion_tokens)
    LLMConfigModel.increment_uses(config_id)

    return jsonify({
        'conversation_id': conversation_id,
        'user_message': serialize_doc(user_message),
        'assistant_message': serialize_doc(assistant_message),
        'is_new_conversation': conversation_id != data.get('conversation_id')
    }), 200


@chat_bp.route('/<conversation_id>/messages', methods=['GET'])
@jwt_required()
@active_user_required
def get_messages(conversation_id):
    """Get messages for a conversation"""
    user = get_current_user()
    user_id = str(user['_id'])

    conversation = ConversationModel.find_by_id(conversation_id)
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 100))
    skip = (page - 1) * limit

    # Get branch_id from query params, default to active branch
    branch_id = request.args.get('branch_id', conversation.get('active_branch', 'main'))

    messages = MessageModel.find_by_conversation(conversation_id, skip=skip, limit=limit, branch_id=branch_id)
    total = MessageModel.count_by_conversation(conversation_id)

    return jsonify({
        'messages': serialize_doc(messages),
        'total': total,
        'page': page,
        'limit': limit,
        'branch_id': branch_id
    }), 200


@chat_bp.route('/messages/<message_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_message(message_id):
    """Delete a message"""
    user = get_current_user()
    user_id = str(user['_id'])

    message = MessageModel.find_by_id(message_id)
    if not message:
        return jsonify({'error': 'Message not found'}), 404

    # Verify ownership via conversation
    conversation = ConversationModel.find_by_id(message['conversation_id'])
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Message not found'}), 404

    MessageModel.delete(message_id)

    return jsonify({'message': 'Message deleted'}), 200


@chat_bp.route('/messages/<message_id>', methods=['PUT'])
@jwt_required()
@active_user_required
def edit_message(message_id):
    """Edit a user message and optionally regenerate the AI response"""
    # Validate ObjectId format (prevents crash on temp IDs like "temp-123456")
    if not ObjectId.is_valid(message_id):
        return jsonify({'error': 'Invalid message ID format'}), 400

    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    new_content = data.get('content', '').strip()
    regenerate = data.get('regenerate', True)

    if not new_content:
        return jsonify({'error': 'Content is required'}), 400

    message = MessageModel.find_by_id(message_id)
    if not message:
        return jsonify({'error': 'Message not found'}), 404

    if message['role'] != 'user':
        return jsonify({'error': 'Only user messages can be edited'}), 400

    # Verify ownership via conversation
    conversation = ConversationModel.find_by_id(message['conversation_id'])
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    conversation_id = str(conversation['_id'])
    branch_id = message.get('branch_id', 'main')

    # Store edit history
    edit_history = message.get('edit_history', [])
    edit_history.append({
        'content': message['content'],
        'edited_at': message.get('created_at')
    })

    # Update the message content
    MessageModel.update_with_edit_history(message_id, new_content, edit_history)

    # Delete all messages after this one if regenerating
    if regenerate:
        deleted_count = MessageModel.delete_after_message(conversation_id, message_id, branch_id=branch_id)

    updated_message = MessageModel.find_by_id(message_id)

    response_data = {
        'message': serialize_doc(updated_message),
        'deleted_count': deleted_count if regenerate else 0
    }

    # If regenerating, generate new AI response
    if regenerate:
        config = LLMConfigModel.find_by_id(conversation['config_id'])
        if not config:
            return jsonify({'error': 'Config not found', **response_data}), 404

        # Get context including the edited message (in the same branch)
        messages = MessageModel.find_by_conversation(conversation_id, branch_id=branch_id)
        formatted_messages = OpenRouterService.format_messages_for_api(messages)

        params = config.get('parameters', {})
        start_time = time.time()

        # Get user AI preferences and build enhanced system prompt
        ai_prefs = user.get('ai_preferences', {})
        enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
            config.get('system_prompt'),
            ai_prefs
        )

        ai_response = OpenRouterService.chat_completion(
            messages=formatted_messages,
            model=config['model_id'],
            system_prompt=enhanced_prompt,
            temperature=params.get('temperature', 0.7),
            max_tokens=params.get('max_tokens', 2048),
            stream=False
        )

        generation_time_ms = int((time.time() - start_time) * 1000)

        if 'error' in ai_response:
            error_msg = ai_response['error'].get('message', 'Generation failed')
            error_message = MessageModel.create_error_message(
                conversation_id=conversation_id,
                error_message=error_msg,
                model_id=config['model_id']
            )
            return jsonify({
                'error': error_msg,
                **response_data,
                'assistant_message': serialize_doc(error_message)
            }), 500

        choices = ai_response.get('choices', [])
        content = choices[0]['message']['content'] if choices else ''
        usage = ai_response.get('usage', {})

        assistant_message = MessageModel.create_assistant_message(
            conversation_id=conversation_id,
            content=content,
            model_id=config['model_id'],
            prompt_tokens=usage.get('prompt_tokens', 0),
            completion_tokens=usage.get('completion_tokens', 0),
            generation_time_ms=generation_time_ms,
            finish_reason=choices[0].get('finish_reason', 'stop') if choices else 'stop',
            branch_id=branch_id
        )

        # Update stats
        UserModel.increment_usage(
            user_id,
            messages=1,
            tokens=usage.get('prompt_tokens', 0) + usage.get('completion_tokens', 0)
        )

        response_data['assistant_message'] = serialize_doc(assistant_message)

    return jsonify(response_data), 200


@chat_bp.route('/regenerate/<message_id>', methods=['POST'])
@jwt_required()
@active_user_required
def regenerate_message(message_id):
    """Regenerate an assistant message. Optionally create a branch instead of deleting."""
    import uuid

    user = get_current_user()
    user_id = str(user['_id'])

    data = request.get_json() or {}
    create_branch = data.get('create_branch', False)
    branch_name = data.get('branch_name')

    message = MessageModel.find_by_id(message_id)
    if not message or message['role'] != 'assistant':
        return jsonify({'error': 'Message not found or not regeneratable'}), 404

    conversation = ConversationModel.find_by_id(message['conversation_id'])
    if not conversation or str(conversation['user_id']) != user_id:
        return jsonify({'error': 'Conversation not found'}), 404

    conversation_id = str(conversation['_id'])
    current_branch = message.get('branch_id', 'main')

    # Get config
    config = LLMConfigModel.find_by_id(conversation['config_id'])
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    # Get all messages in the branch
    all_messages = MessageModel.find_by_conversation(conversation_id, branch_id=current_branch)

    # Find the user message that prompted this assistant response
    target_user_msg = None
    for i, msg in enumerate(all_messages):
        if str(msg['_id']) == message_id:
            # Find the previous user message
            for j in range(i - 1, -1, -1):
                if all_messages[j]['role'] == 'user':
                    target_user_msg = all_messages[j]
                    break
            break

    if not target_user_msg:
        return jsonify({'error': 'No user message found'}), 400

    target_branch = current_branch
    new_branch_id = None

    if create_branch:
        # Create a new branch from the user message
        new_branch_id = str(uuid.uuid4())[:12]
        branch_data = {
            'id': new_branch_id,
            'name': branch_name or 'Regeneration branch',
            'parent_branch': current_branch,
            'branch_point_message_id': str(target_user_msg['_id'])
        }
        ConversationModel.add_branch(conversation_id, branch_data)

        # Copy messages up to and including the user message to the new branch
        messages_to_copy = MessageModel.find_up_to(conversation_id, str(target_user_msg['_id']), current_branch)
        for msg in messages_to_copy:
            MessageModel.copy_to_branch(msg, new_branch_id)

        target_branch = new_branch_id
        ConversationModel.set_active_branch(conversation_id, new_branch_id)
    else:
        # Delete the old assistant message and any subsequent messages
        MessageModel.delete_after_message(conversation_id, str(target_user_msg['_id']), branch_id=current_branch)

    # Get context for generation (messages in target branch)
    context_messages = MessageModel.find_by_conversation(conversation_id, branch_id=target_branch)
    formatted_messages = OpenRouterService.format_messages_for_api(context_messages)

    params = config.get('parameters', {})
    start_time = time.time()

    # Get user AI preferences and build enhanced system prompt
    full_user = UserModel.find_by_id(user_id)
    ai_prefs = full_user.get('ai_preferences', {}) if full_user else {}
    enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
        config.get('system_prompt'),
        ai_prefs
    )

    response = OpenRouterService.chat_completion(
        messages=formatted_messages,
        model=config['model_id'],
        system_prompt=enhanced_prompt,
        temperature=params.get('temperature', 0.7),
        max_tokens=params.get('max_tokens', 2048),
        stream=False
    )

    generation_time_ms = int((time.time() - start_time) * 1000)

    if 'error' in response:
        return jsonify({'error': response['error'].get('message', 'Generation failed')}), 500

    choices = response.get('choices', [])
    content = choices[0]['message']['content'] if choices else ''
    usage = response.get('usage', {})

    assistant_message = MessageModel.create_assistant_message(
        conversation_id=conversation_id,
        content=content,
        model_id=config['model_id'],
        prompt_tokens=usage.get('prompt_tokens', 0),
        completion_tokens=usage.get('completion_tokens', 0),
        generation_time_ms=generation_time_ms,
        finish_reason=choices[0].get('finish_reason', 'stop') if choices else 'stop',
        branch_id=target_branch
    )

    response_data = {
        'message': serialize_doc(assistant_message),
        'branch_id': target_branch
    }

    if new_branch_id:
        response_data['new_branch_id'] = new_branch_id
        # Get updated branches
        updated_conv = ConversationModel.find_by_id(conversation_id)
        response_data['branches'] = serialize_doc(updated_conv.get('branches', []))

    return jsonify(response_data), 200
