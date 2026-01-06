import time
import eventlet
from flask import request
from flask_socketio import emit
from bson import ObjectId
from app.models.arena_session import ArenaSessionModel
from app.models.arena_message import ArenaMessageModel
from app.models.llm_config import LLMConfigModel
from app.services.openrouter_service import OpenRouterService
from app.sockets.connection_events import get_user_id_from_sid
from app.utils.helpers import serialize_doc

# Store active arena generations for cancellation
active_arena_generations = {}


def register_arena_events(socketio):
    """Register arena-related socket events"""

    @socketio.on('arena_send_message')
    def handle_arena_send_message(data):
        """Handle arena message - stream to multiple configs in parallel"""
        user_id = get_user_id_from_sid(request.sid)
        if not user_id:
            emit('error', {'message': 'Not authenticated'})
            return

        session_id = data.get('session_id')
        message_content = data.get('message', '').strip()
        config_ids = data.get('config_ids', [])

        if not message_content:
            emit('error', {'message': 'Message is required'})
            return

        if not config_ids or len(config_ids) < 2:
            emit('error', {'message': 'At least 2 configs required'})
            return

        # Create or get session
        if session_id:
            session = ArenaSessionModel.find_by_id(session_id)
            if not session or str(session['user_id']) != user_id:
                emit('error', {'message': 'Session not found'})
                return
        else:
            session = ArenaSessionModel.create(user_id, config_ids, 'Arena Session')
            session_id = str(session['_id'])
            emit('arena_session_created', {'session': serialize_doc(session)})

        # Save user message
        user_message = ArenaMessageModel.create(
            session_id=session_id,
            role='user',
            content=message_content
        )

        emit('arena_user_message', {
            'session_id': session_id,
            'message': serialize_doc(user_message)
        })

        # Get conversation history for context
        history = ArenaMessageModel.find_by_session(session_id)

        # Initialize cancellation tracking
        active_arena_generations[session_id] = {
            'cancelled': False,
            'greenlets': []
        }

        # Spawn parallel generation for each config
        for config_id in config_ids:
            greenlet = eventlet.spawn(
                generate_arena_response,
                socketio,
                session_id,
                user_id,
                config_id,
                message_content,
                history,
                request.sid
            )
            active_arena_generations[session_id]['greenlets'].append(greenlet)

    @socketio.on('arena_stop_generation')
    def handle_arena_stop(data):
        """Stop arena generation"""
        session_id = data.get('session_id')
        user_id = get_user_id_from_sid(request.sid)

        if session_id and session_id in active_arena_generations:
            session = ArenaSessionModel.find_by_id(session_id)
            if session and str(session['user_id']) == user_id:
                active_arena_generations[session_id]['cancelled'] = True
                emit('arena_generation_stopped', {'session_id': session_id})


def generate_arena_response(socketio, session_id, user_id, config_id, message, history, sid):
    """Generate response for a single config in arena mode"""
    config = LLMConfigModel.find_by_id(config_id)
    if not config:
        socketio.emit('arena_message_error', {
            'session_id': session_id,
            'config_id': config_id,
            'error': 'Config not found'
        }, to=sid)
        return

    # Create assistant message placeholder
    assistant_message = ArenaMessageModel.create(
        session_id=session_id,
        role='assistant',
        content='',
        config_id=config_id
    )
    message_id = str(assistant_message['_id'])

    # Emit message start
    socketio.emit('arena_message_start', {
        'session_id': session_id,
        'config_id': config_id,
        'message_id': message_id
    }, to=sid)

    # Build context messages
    formatted_messages = []
    for msg in history:
        if msg['role'] == 'user':
            formatted_messages.append({'role': 'user', 'content': msg['content']})
        elif msg['role'] == 'assistant' and msg.get('config_id') and str(msg['config_id']) == config_id:
            formatted_messages.append({'role': 'assistant', 'content': msg['content']})

    # Add current message
    formatted_messages.append({'role': 'user', 'content': message})

    # Stream response
    start_time = time.time()
    full_content = ''
    prompt_tokens = 0
    completion_tokens = 0

    try:
        params = config.get('parameters', {})
        stream = OpenRouterService.chat_completion(
            messages=formatted_messages,
            model=config['model_id'],
            system_prompt=config.get('system_prompt'),
            temperature=params.get('temperature', 0.7),
            max_tokens=params.get('max_tokens', 2048),
            top_p=params.get('top_p', 1.0),
            stream=True
        )

        for chunk in stream:
            # Check for cancellation
            if active_arena_generations.get(session_id, {}).get('cancelled'):
                break

            if 'error' in chunk:
                socketio.emit('arena_message_error', {
                    'session_id': session_id,
                    'config_id': config_id,
                    'message_id': message_id,
                    'error': chunk['error'].get('message', 'Unknown error')
                }, to=sid)
                return

            if chunk.get('done'):
                break

            choices = chunk.get('choices', [])
            if choices:
                delta = choices[0].get('delta', {})
                content = delta.get('content', '')
                if content:
                    full_content += content
                    socketio.emit('arena_message_chunk', {
                        'session_id': session_id,
                        'config_id': config_id,
                        'message_id': message_id,
                        'content': content
                    }, to=sid)
                    eventlet.sleep(0)

            usage = chunk.get('usage', {})
            if usage:
                prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                completion_tokens = usage.get('completion_tokens', completion_tokens)

    except Exception as e:
        socketio.emit('arena_message_error', {
            'session_id': session_id,
            'config_id': config_id,
            'message_id': message_id,
            'error': str(e)
        }, to=sid)
        return

    generation_time = int((time.time() - start_time) * 1000)

    # Update message in database
    ArenaMessageModel.get_collection().update_one(
        {'_id': ObjectId(message_id)},
        {'$set': {
            'content': full_content,
            'metadata': {
                'model_id': config['model_id'],
                'tokens': {'prompt': prompt_tokens, 'completion': completion_tokens},
                'generation_time_ms': generation_time
            }
        }}
    )

    # Emit completion
    socketio.emit('arena_message_complete', {
        'session_id': session_id,
        'config_id': config_id,
        'message_id': message_id,
        'content': full_content,
        'metadata': {
            'model_id': config['model_id'],
            'tokens': {'prompt': prompt_tokens, 'completion': completion_tokens},
            'generation_time_ms': generation_time
        }
    }, to=sid)

    # Cleanup
    if session_id in active_arena_generations:
        del active_arena_generations[session_id]
