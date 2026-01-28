import time
import json
import queue
import threading
from flask import Blueprint, request, Response, jsonify, stream_with_context, current_app
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.arena_session import ArenaSessionModel
from app.models.arena_message import ArenaMessageModel
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.utils.helpers import serialize_doc

arena_stream_bp = Blueprint('arena_stream', __name__)

# Store active arena generations for cancellation
active_arena_generations = {}


def sse_event(event_type, data):
    """Format data as SSE event"""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@arena_stream_bp.route('/stream', methods=['POST'])
@jwt_required()
def stream_arena():
    """
    SSE endpoint for arena parallel streaming.
    Streams chunks from multiple configs interleaved into single response.
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    session_id = data.get('session_id')
    message_content = data.get('message', '').strip()
    config_ids = data.get('config_ids', [])

    # Validation
    if not message_content:
        return jsonify({'error': 'Message is required'}), 400

    if not config_ids or len(config_ids) < 2:
        return jsonify({'error': 'At least 2 configs required'}), 400

    def generate():
        nonlocal session_id

        # Create or get session
        if session_id:
            session = ArenaSessionModel.find_by_id(session_id)
            if not session or str(session['user_id']) != user_id:
                yield sse_event('error', {'message': 'Session not found'})
                return
        else:
            session = ArenaSessionModel.create(user_id, config_ids, 'Arena Session')
            session_id = str(session['_id'])
            yield sse_event('arena_session_created', {'session': serialize_doc(session)})

        # Save user message
        user_message = ArenaMessageModel.create(
            session_id=session_id,
            role='user',
            content=message_content
        )

        yield sse_event('arena_user_message', {
            'session_id': session_id,
            'message': serialize_doc(user_message)
        })

        # Get conversation history
        history = ArenaMessageModel.find_by_session(session_id)

        # Fetch all configs
        configs = {}
        for config_id in config_ids:
            config = LLMConfigModel.find_by_id(config_id)
            if config:
                configs[config_id] = config
            else:
                yield sse_event('arena_message_error', {
                    'session_id': session_id,
                    'config_id': config_id,
                    'error': 'Config not found'
                })

        # Create placeholder messages for each config
        message_ids = {}
        for config_id in configs:
            assistant_message = ArenaMessageModel.create(
                session_id=session_id,
                role='assistant',
                content='',
                config_id=config_id
            )
            message_ids[config_id] = str(assistant_message['_id'])

        # Get user AI preferences for enhanced prompts
        full_user = UserModel.find_by_id(user_id)
        ai_prefs = full_user.get('ai_preferences', {}) if full_user else {}

        # Initialize cancellation tracking
        active_arena_generations[session_id] = {'cancelled': False}

        # Use thread-safe queue for collecting events from threads
        event_queue = queue.Queue()
        active_threads = []

        # Capture Flask app for thread context
        app = current_app._get_current_object()

        def generate_for_config(config_id, config, message_id):
            """Generate response for a single config"""
            # Wrap entire function body with app context for thread safety
            # Required for OpenRouterService (uses current_app.config) and DB operations
            with app.app_context():
                try:
                    # Emit start
                    event_queue.put(('arena_message_start', {
                        'session_id': session_id,
                        'config_id': config_id,
                        'message_id': message_id
                    }))

                    # Build context messages
                    formatted_messages = []
                    for msg in history:
                        if msg['role'] == 'user':
                            formatted_messages.append({'role': 'user', 'content': msg['content']})
                        elif msg['role'] == 'assistant' and msg.get('config_id') and str(msg['config_id']) == config_id:
                            formatted_messages.append({'role': 'assistant', 'content': msg['content']})

                    # Add current message
                    formatted_messages.append({'role': 'user', 'content': message_content})

                    # Stream response
                    start_time = time.time()
                    full_content = ''
                    prompt_tokens = 0
                    completion_tokens = 0

                    params = config.get('parameters', {})

                    # Build enhanced system prompt with user preferences
                    enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
                        config.get('system_prompt'),
                        ai_prefs
                    )

                    stream = OpenRouterService.chat_completion(
                        messages=formatted_messages,
                        model=config['model_id'],
                        system_prompt=enhanced_prompt,
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
                            event_queue.put(('arena_message_error', {
                                'session_id': session_id,
                                'config_id': config_id,
                                'message_id': message_id,
                                'error': chunk['error'].get('message', 'Unknown error')
                            }))
                            return

                        if chunk.get('done'):
                            break

                        choices = chunk.get('choices', [])
                        if choices:
                            delta = choices[0].get('delta', {})
                            content = delta.get('content', '')
                            if content:
                                full_content += content
                                event_queue.put(('arena_message_chunk', {
                                    'session_id': session_id,
                                    'config_id': config_id,
                                    'message_id': message_id,
                                    'content': content
                                }))

                            usage = chunk.get('usage', {})
                            if usage:
                                prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                                completion_tokens = usage.get('completion_tokens', completion_tokens)

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
                    event_queue.put(('arena_message_complete', {
                        'session_id': session_id,
                        'config_id': config_id,
                        'message_id': message_id,
                        'content': full_content,
                        'metadata': {
                            'model_id': config['model_id'],
                            'tokens': {'prompt': prompt_tokens, 'completion': completion_tokens},
                            'generation_time_ms': generation_time
                        }
                    }))

                except Exception as e:
                    event_queue.put(('arena_message_error', {
                        'session_id': session_id,
                        'config_id': config_id,
                        'message_id': message_id,
                        'error': str(e)
                    }))

        # Start threads for each config
        for config_id, config in configs.items():
            thread = threading.Thread(
                target=generate_for_config,
                args=(config_id, config, message_ids[config_id])
            )
            thread.daemon = True
            thread.start()
            active_threads.append(thread)

        # Yield events from queue until all threads complete
        completed_configs = set()
        while len(completed_configs) < len(configs):
            try:
                event_type, event_data = event_queue.get(timeout=0.1)
                yield sse_event(event_type, event_data)

                # Track completions and errors
                if event_type in ('arena_message_complete', 'arena_message_error'):
                    completed_configs.add(event_data.get('config_id'))

            except queue.Empty:
                # Check if all threads are done
                if all(not t.is_alive() for t in active_threads):
                    # Drain any remaining events
                    while not event_queue.empty():
                        event_type, event_data = event_queue.get_nowait()
                        yield sse_event(event_type, event_data)
                        if event_type in ('arena_message_complete', 'arena_message_error'):
                            completed_configs.add(event_data.get('config_id'))
                    break
                continue

        # Cleanup
        if session_id in active_arena_generations:
            del active_arena_generations[session_id]

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@arena_stream_bp.route('/cancel/<session_id>', methods=['POST'])
@jwt_required()
def cancel_arena_generation(session_id):
    """Cancel arena generation for a session"""
    user = get_current_user()
    user_id = str(user['_id'])

    session = ArenaSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    if session_id in active_arena_generations:
        active_arena_generations[session_id]['cancelled'] = True
        return jsonify({'success': True, 'message': 'Arena generation cancelled'})

    return jsonify({'error': 'No active generation'}), 404
