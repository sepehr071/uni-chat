import time
from flask import request
from flask_socketio import emit
from bson import ObjectId
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.sockets.connection_events import get_user_id_from_sid, active_connections
from app.utils.helpers import serialize_doc, generate_conversation_title


# Store active generation tasks for cancellation
active_generations = {}


def register_chat_events(socketio):
    """Register chat-related socket events"""

    @socketio.on('send_message')
    def handle_send_message(data):
        """Handle incoming chat message and stream AI response"""
        user_id = get_user_id_from_sid(request.sid)
        if not user_id:
            emit('error', {'message': 'Not authenticated'})
            return

        conversation_id = data.get('conversation_id')
        config_id = data.get('config_id')
        message_content = data.get('message', '').strip()
        attachments = data.get('attachments', [])

        if not message_content:
            emit('error', {'message': 'Message content is required'})
            return

        if not config_id:
            emit('error', {'message': 'config_id is required'})
            return

        # Get config
        config = LLMConfigModel.find_by_id(config_id)
        if not config:
            emit('error', {'message': 'Config not found'})
            return

        # Check user token limit
        user = UserModel.find_by_id(user_id)
        if user['usage']['tokens_limit'] != -1:
            if user['usage']['tokens_used'] >= user['usage']['tokens_limit']:
                emit('error', {'message': 'Token limit reached'})
                return

        # Create or get conversation
        if conversation_id:
            conversation = ConversationModel.find_by_id(conversation_id)
            if not conversation or str(conversation['user_id']) != user_id:
                emit('error', {'message': 'Conversation not found'})
                return
        else:
            # Create new conversation
            title = generate_conversation_title(message_content)
            conversation = ConversationModel.create(
                user_id=user_id,
                config_id=config_id,
                title=title
            )
            conversation_id = str(conversation['_id'])

            # Notify about new conversation
            emit('conversation_created', {
                'conversation': serialize_doc(conversation)
            })

        # Save user message
        user_message = MessageModel.create_user_message(
            conversation_id=conversation_id,
            content=message_content,
            attachments=attachments
        )

        emit('message_saved', {
            'message': serialize_doc(user_message),
            'conversation_id': conversation_id
        })

        # Get conversation context
        context_messages = MessageModel.get_context_messages(conversation_id, limit=20)
        formatted_messages = OpenRouterService.format_messages_for_api(context_messages)

        # Add the new message
        formatted_messages.append({
            'role': 'user',
            'content': message_content
        })

        # Create placeholder for assistant message
        assistant_message = MessageModel.create(
            conversation_id=conversation_id,
            role='assistant',
            content='',
            metadata={'model_id': config['model_id']}
        )
        message_id = str(assistant_message['_id'])

        # Store generation task
        active_generations[message_id] = {
            'cancelled': False,
            'user_id': user_id
        }

        # Emit message start
        emit('message_start', {
            'message_id': message_id,
            'conversation_id': conversation_id
        })

        # Start streaming response
        start_time = time.time()
        full_content = ''
        prompt_tokens = 0
        completion_tokens = 0
        finish_reason = 'stop'

        try:
            params = config.get('parameters', {})
            stream = OpenRouterService.chat_completion(
                messages=formatted_messages,
                model=config['model_id'],
                system_prompt=config.get('system_prompt'),
                temperature=params.get('temperature', 0.7),
                max_tokens=params.get('max_tokens', 2048),
                top_p=params.get('top_p', 1.0),
                frequency_penalty=params.get('frequency_penalty', 0.0),
                presence_penalty=params.get('presence_penalty', 0.0),
                stream=True
            )

            for chunk in stream:
                # Check for cancellation
                if active_generations.get(message_id, {}).get('cancelled'):
                    finish_reason = 'cancelled'
                    break

                if 'error' in chunk:
                    # Handle error
                    error_msg = chunk['error'].get('message', 'Unknown error')
                    emit('message_error', {
                        'message_id': message_id,
                        'error': error_msg,
                        'conversation_id': conversation_id
                    })

                    # Update message as error
                    MessageModel.get_collection().update_one(
                        {'_id': ObjectId(message_id)},
                        {
                            '$set': {
                                'is_error': True,
                                'error_message': error_msg
                            }
                        }
                    )
                    return

                if chunk.get('done'):
                    break

                # Extract content from chunk
                choices = chunk.get('choices', [])
                if choices:
                    delta = choices[0].get('delta', {})
                    content = delta.get('content', '')
                    if content:
                        full_content += content
                        emit('message_chunk', {
                            'message_id': message_id,
                            'content': content,
                            'conversation_id': conversation_id,
                            'is_final': False
                        })

                    # Check for finish reason
                    if choices[0].get('finish_reason'):
                        finish_reason = choices[0]['finish_reason']

                # Get usage info if available
                usage = chunk.get('usage', {})
                if usage:
                    prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                    completion_tokens = usage.get('completion_tokens', completion_tokens)

        except Exception as e:
            emit('message_error', {
                'message_id': message_id,
                'error': str(e),
                'conversation_id': conversation_id
            })
            return

        finally:
            # Clean up generation task
            if message_id in active_generations:
                del active_generations[message_id]

        # Calculate generation time
        generation_time_ms = int((time.time() - start_time) * 1000)

        # Estimate tokens if not provided
        if not prompt_tokens:
            prompt_tokens = OpenRouterService.estimate_tokens(
                ' '.join([m['content'] for m in formatted_messages if isinstance(m['content'], str)])
            )
        if not completion_tokens:
            completion_tokens = OpenRouterService.estimate_tokens(full_content)

        # Update assistant message with full content
        MessageModel.get_collection().update_one(
            {'_id': ObjectId(message_id)},
            {
                '$set': {
                    'content': full_content,
                    'metadata': {
                        'model_id': config['model_id'],
                        'tokens': {
                            'prompt': prompt_tokens,
                            'completion': completion_tokens
                        },
                        'generation_time_ms': generation_time_ms,
                        'finish_reason': finish_reason
                    }
                }
            }
        )

        # Update conversation stats
        ConversationModel.increment_message_count(
            conversation_id,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens
        )

        # Update user stats
        UserModel.increment_usage(
            user_id,
            messages=2,  # user + assistant
            tokens=prompt_tokens + completion_tokens
        )

        # Update config usage
        LLMConfigModel.increment_uses(config_id)

        # Emit completion
        emit('message_complete', {
            'message_id': message_id,
            'content': full_content,
            'conversation_id': conversation_id,
            'metadata': {
                'model_id': config['model_id'],
                'tokens': {
                    'prompt': prompt_tokens,
                    'completion': completion_tokens
                },
                'generation_time_ms': generation_time_ms,
                'finish_reason': finish_reason
            },
            'is_final': True
        })

    @socketio.on('stop_generation')
    def handle_stop_generation(data):
        """Stop an ongoing generation"""
        message_id = data.get('message_id')
        user_id = get_user_id_from_sid(request.sid)

        if not message_id or not user_id:
            return

        # Verify ownership
        if message_id in active_generations:
            if active_generations[message_id]['user_id'] == user_id:
                active_generations[message_id]['cancelled'] = True
                emit('generation_stopped', {
                    'message_id': message_id,
                    'message': 'Generation stopped'
                })

    @socketio.on('regenerate_message')
    def handle_regenerate(data):
        """Regenerate an assistant message"""
        user_id = get_user_id_from_sid(request.sid)
        if not user_id:
            emit('error', {'message': 'Not authenticated'})
            return

        message_id = data.get('message_id')
        if not message_id:
            emit('error', {'message': 'message_id required'})
            return

        # Get the message
        message = MessageModel.find_by_id(message_id)
        if not message or message['role'] != 'assistant':
            emit('error', {'message': 'Message not found or not regeneratable'})
            return

        # Get conversation
        conversation = ConversationModel.find_by_id(message['conversation_id'])
        if not conversation or str(conversation['user_id']) != user_id:
            emit('error', {'message': 'Conversation not found'})
            return

        # Delete the old assistant message
        MessageModel.delete(message_id)

        # Get last user message to regenerate from
        messages = MessageModel.find_by_conversation(conversation['_id'])
        if not messages:
            emit('error', {'message': 'No messages to regenerate from'})
            return

        # Find the user message before this assistant message
        last_user_message = None
        for msg in reversed(messages):
            if msg['role'] == 'user':
                last_user_message = msg
                break

        if not last_user_message:
            emit('error', {'message': 'No user message found'})
            return

        # Trigger new generation
        handle_send_message({
            'conversation_id': str(conversation['_id']),
            'config_id': str(conversation['config_id']),
            'message': last_user_message['content'],
            'attachments': last_user_message.get('attachments', [])
        })
