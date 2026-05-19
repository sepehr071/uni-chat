import time
import json
import threading
from flask import Blueprint, request, Response, jsonify, current_app, stream_with_context
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.services.dlp_gate import DLPBlockedError, format_blocked_response, gate as dlp_gate
from app.services import stream_state
from app.utils.helpers import serialize_doc, generate_conversation_title
from app.utils.config_resolver import resolve_config as resolve_chat_config

chat_stream_bp = Blueprint('chat_stream', __name__)


def sse_event(event_type, data):
    """Format data as SSE event"""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@chat_stream_bp.route('/stream', methods=['POST'])
@jwt_required()
def stream_chat():
    """
    SSE endpoint for chat streaming.
    Replaces WebSocket send_message event.
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json(silent=True) or {}

    conversation_id = data.get('conversation_id')
    config_id = data.get('config_id')
    message_content = data.get('message', '').strip()
    attachments = data.get('attachments', [])
    intent = data.get('intent')

    # Validation
    if not message_content:
        return jsonify({'error': 'Message content is required'}), 400

    if not config_id:
        return jsonify({'error': 'config_id is required'}), 400

    # Get config (supports quick models)
    config = resolve_chat_config(config_id)
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    is_quick_model = str(config_id).startswith('quick:')
    is_agent_model = str(config_id).startswith('agent:')

    # DLP gate — scan user-typed message before persisting and before LLM call.
    project_id_for_dlp = None
    if conversation_id:
        _conv = ConversationModel.find_by_id(conversation_id)
        if _conv:
            project_id_for_dlp = _conv.get('project_id')
    # Prefer explicit UI language from request body (i18next current language);
    # fall back to user.ai_preferences.user_info.language; final fallback 'en'.
    body_lang = (data.get('lang') or '').strip()
    user_lang = (
        body_lang
        or user.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
        or 'en'
    )[:2].lower()
    try:
        dlp_gate(
            text=message_content,
            user_id=user['_id'],
            workspace_id=user.get('active_workspace_id'),
            project_id=project_id_for_dlp,
            source='chat',
            source_ref={'conversation_id': conversation_id},
            confirmed=bool(data.get('dlp_confirmed')),
            user_lang=user_lang,
        )
    except DLPBlockedError as dlp_exc:
        return jsonify(format_blocked_response(dlp_exc)), 403

    # Check user token limit
    if user['usage']['tokens_limit'] != -1:
        if user['usage']['tokens_used'] >= user['usage']['tokens_limit']:
            return jsonify({'error': 'Token limit reached'}), 429

    # Capture app object BEFORE generator definition (Flask context is active here)
    app = current_app._get_current_object()

    def generate():
        nonlocal conversation_id

        # Create or get conversation
        is_new_conversation = False
        if conversation_id:
            conversation = ConversationModel.find_by_id(conversation_id)
            if not conversation or str(conversation['user_id']) != user_id:
                yield sse_event('error', {'message': 'Conversation not found'})
                return
        else:
            # Create new conversation with temporary title
            is_new_conversation = True
            title = generate_conversation_title(message_content)
            conversation = ConversationModel.create(
                user_id=user_id,
                config_id=config_id,
                title=title
            )
            conversation_id = str(conversation['_id'])

            # Notify about new conversation
            yield sse_event('conversation_created', {
                'conversation': serialize_doc(conversation)
            })

        # Get active branch
        branch_id = conversation.get('active_branch', 'main')

        # Generate better title in background thread (only for new conversations)
        if is_new_conversation:
            title_ws_id = conversation.get('workspace_id') or user.get('active_workspace_id')
            title_proj_id = conversation.get('project_id')

            def generate_title_async(app, conv_id, message, orig_title, uid, ws_id, proj_id):
                with app.app_context():
                    try:
                        better_title = OpenRouterService.generate_title(
                            message,
                            user_id=uid,
                            conversation_id=conv_id,
                            workspace_id=str(ws_id) if ws_id else None,
                            project_id=str(proj_id) if proj_id else None,
                            origin='web',
                        )
                        if better_title and better_title != orig_title:
                            ConversationModel.update(conv_id, {'title': better_title})
                    except Exception as e:
                        print(f"Title generation failed: {e}")

            thread = threading.Thread(
                target=generate_title_async,
                args=(app, conversation_id, message_content, title, user_id, title_ws_id, title_proj_id)
            )
            thread.daemon = True
            thread.start()

        # Save user message
        user_message = MessageModel.create_user_message(
            conversation_id=conversation_id,
            content=message_content,
            attachments=attachments,
            branch_id=branch_id
        )

        yield sse_event('message_saved', {
            'message': serialize_doc(user_message),
            'conversation_id': conversation_id,
            'branch_id': branch_id
        })

        # Get conversation context (for the current branch)
        context_messages = MessageModel.get_context_messages(conversation_id, limit=20, branch_id=branch_id)
        formatted_messages = OpenRouterService.format_messages_for_api(context_messages)

        # Create placeholder for assistant message
        assistant_message = MessageModel.create(
            conversation_id=conversation_id,
            role='assistant',
            content='',
            metadata={**{'model_id': config['model_id']}, **(({'intent': intent}) if intent else {})},
            branch_id=branch_id
        )
        message_id = str(assistant_message['_id'])

        # Store generation task for cancellation (Mongo-backed for multi-worker reach — P0.2)
        stream_state.register(message_id, user_id=user_id)

        # Emit message start
        yield sse_event('message_start', {
            'message_id': message_id,
            'conversation_id': conversation_id,
            'branch_id': branch_id
        })

        # Start streaming response
        start_time = time.time()
        full_content = ''
        prompt_tokens = 0
        completion_tokens = 0
        finish_reason = 'stop'

        try:
            params = config.get('parameters', {})

            # Get user AI preferences and build enhanced system prompt
            ai_prefs = user.get('ai_preferences', {})
            enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
                config.get('system_prompt'),
                ai_prefs
            )

            ws_id = user.get('active_workspace_id')
            proj_id = conversation.get('project_id')
            stream = OpenRouterService.chat_completion(
                messages=formatted_messages,
                model=config['model_id'],
                system_prompt=enhanced_prompt,
                temperature=params.get('temperature', 0.7),
                max_tokens=params.get('max_tokens', 2048),
                top_p=params.get('top_p', 1.0),
                frequency_penalty=params.get('frequency_penalty', 0.0),
                presence_penalty=params.get('presence_penalty', 0.0),
                stream=True,
                user_id=user_id,
                conversation_id=conversation_id,
                feature='chat',
                workspace_id=str(ws_id) if ws_id else None,
                project_id=str(proj_id) if proj_id else None,
                origin='web',
            )

            for chunk in stream:
                # Check for cancellation (cross-worker — reads from Mongo).
                # P1.22: this is the chunk-level poll. It cancels promptly
                # between chunks but cannot interrupt a blocked
                # ``requests.iter_lines()`` read inside
                # ``OpenRouterService._stream_completion`` (120s socket
                # timeout). A future hardening would inject a per-call
                # ``requests.Session`` here and call ``session.close()`` on
                # cancel, but that requires plumbing the session through
                # ``chat_completion``. Limitation acknowledged; bounded by
                # the 120s read timeout in the service layer.
                if stream_state.is_cancelled(message_id):
                    finish_reason = 'cancelled'
                    break

                if 'error' in chunk:
                    error_msg = chunk['error'].get('message', 'Unknown error')
                    yield sse_event('message_error', {
                        'message_id': message_id,
                        'error': error_msg,
                        'conversation_id': conversation_id
                    })

                    # Update message as error
                    MessageModel.get_collection().update_one(
                        {'_id': ObjectId(message_id)},
                        {'$set': {'is_error': True, 'error_message': error_msg}}
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
                        yield sse_event('message_chunk', {
                            'message_id': message_id,
                            'content': content,
                            'conversation_id': conversation_id
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
            yield sse_event('message_error', {
                'message_id': message_id,
                'error': str(e),
                'conversation_id': conversation_id
            })
            return

        finally:
            # Clean up generation task
            stream_state.clear(message_id)

        # Calculate generation time
        generation_time_ms = int((time.time() - start_time) * 1000)

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
                        'finish_reason': finish_reason,
                        **({'intent': intent} if intent else {})
                    }
                }
            }
        )

        # Update stats
        ConversationModel.increment_message_count(
            conversation_id,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens
        )
        UserModel.increment_usage(user_id, messages=2, tokens=prompt_tokens + completion_tokens)
        if not is_quick_model and not is_agent_model:
            LLMConfigModel.increment_uses(config_id)

        # Emit completion
        payload = {
            'message_id': message_id,
            'content': full_content,
            'conversation_id': conversation_id,
            'branch_id': branch_id,
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
        if intent:
            payload['intent'] = intent
        yield sse_event('message_complete', payload)

        # Check if title was updated (for new conversations)
        if is_new_conversation:
            updated_conv = ConversationModel.find_by_id(conversation_id)
            if updated_conv and updated_conv.get('title') != title:
                yield sse_event('title_updated', {
                    'conversation_id': conversation_id,
                    'title': updated_conv['title']
                })

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable nginx buffering
            'Connection': 'keep-alive'
        }
    )


@chat_stream_bp.route('/cancel/<message_id>', methods=['POST'])
@jwt_required()
def cancel_generation(message_id):
    """Cancel an ongoing generation"""
    user = get_current_user()
    user_id = str(user['_id'])

    owner = stream_state.owner_of(message_id)
    if owner is None:
        return jsonify({'error': 'Generation not found'}), 404
    if owner != user_id:
        return jsonify({'error': 'Not authorized'}), 403
    stream_state.mark_cancelled(message_id)
    return jsonify({'success': True, 'message': 'Generation cancelled'})
