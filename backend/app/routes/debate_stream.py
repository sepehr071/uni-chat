"""
Debate Stream Routes

SSE streaming endpoint for executing debates.
"""

import time
import json
from flask import Blueprint, request, Response, jsonify, stream_with_context, current_app
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from app.models.debate_session import DebateSessionModel
from app.models.debate_message import DebateMessageModel
from app.models.llm_config import LLMConfigModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.services.debate_service import DebateService
from app.utils.helpers import serialize_doc

debate_stream_bp = Blueprint('debate_stream', __name__)

# Store active debate generations for cancellation
active_debate_generations = {}


def sse_event(event_type: str, data: dict) -> str:
    """Format data as SSE event"""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@debate_stream_bp.route('/stream', methods=['POST'])
@jwt_required()
def stream_debate():
    """
    SSE endpoint for executing a debate.

    Body:
        session_id: str (required) - The debate session to execute

    Events emitted:
        debate_session_started - Debate has begun
        debate_round_start - A new round is starting
        debate_message_start - A debater is about to speak
        debate_message_chunk - Streaming chunk from debater
        debate_message_complete - Debater finished speaking
        debate_round_complete - Round has ended
        debate_judge_start - Judge is analyzing
        debate_judge_chunk - Streaming chunk from judge
        debate_judge_complete - Judge verdict complete
        debate_session_complete - Debate fully complete
        debate_error - An error occurred
    """
    user = get_current_user()
    user_id = str(user['_id'])
    data = request.get_json()

    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id is required'}), 400

    # Validate session
    session = DebateSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    if session.get('status') == 'completed':
        return jsonify({'error': 'Debate already completed'}), 400

    if session.get('status') == 'cancelled':
        return jsonify({'error': 'Debate was cancelled'}), 400

    # Pre-fetch all data needed for the debate (avoid app context issues in generator)
    config_ids = session.get('config_ids', [])
    judge_config_id = str(session.get('judge_config_id', ''))
    topic = session.get('topic', '')
    settings = session.get('settings', {})
    total_rounds = settings.get('rounds', 3)
    max_tokens = settings.get('max_tokens', 2048)

    # Fetch configs
    debater_configs = {}
    config_names = {}
    for config_id in config_ids:
        config = LLMConfigModel.find_by_id(str(config_id))
        if config:
            debater_configs[str(config_id)] = config
            config_names[str(config_id)] = config.get('name', 'Unknown')

    judge_config = LLMConfigModel.find_by_id(judge_config_id)
    if not judge_config:
        return jsonify({'error': 'Judge config not found'}), 404

    # Get user AI preferences
    full_user = UserModel.find_by_id(user_id)
    ai_prefs = full_user.get('ai_preferences', {}) if full_user else {}

    # Capture Flask app for context
    app = current_app._get_current_object()

    def generate():
        nonlocal session_id

        # Initialize cancellation tracking
        active_debate_generations[session_id] = {'cancelled': False}

        try:
            # Update session status
            with app.app_context():
                DebateSessionModel.update_status(session_id, 'in_progress', current_round=1)

            yield sse_event('debate_session_started', {
                'session_id': session_id,
                'topic': topic,
                'total_rounds': total_rounds,
                'debaters': list(config_names.values())
            })

            # Track all messages for context building
            all_messages = []

            # Execute each round
            for round_num in range(1, total_rounds + 1):
                # Check cancellation
                if active_debate_generations.get(session_id, {}).get('cancelled'):
                    yield sse_event('debate_error', {'message': 'Debate cancelled'})
                    with app.app_context():
                        DebateSessionModel.update_status(session_id, 'cancelled')
                    return

                yield sse_event('debate_round_start', {
                    'session_id': session_id,
                    'round': round_num,
                    'total_rounds': total_rounds
                })

                with app.app_context():
                    DebateSessionModel.update_status(session_id, 'in_progress', current_round=round_num)

                # Each debater speaks in sequence
                for order, config_id in enumerate(debater_configs.keys()):
                    # Check cancellation
                    if active_debate_generations.get(session_id, {}).get('cancelled'):
                        yield sse_event('debate_error', {'message': 'Debate cancelled'})
                        with app.app_context():
                            DebateSessionModel.update_status(session_id, 'cancelled')
                        return

                    config = debater_configs[config_id]
                    speaker_name = config_names[config_id]

                    yield sse_event('debate_message_start', {
                        'session_id': session_id,
                        'round': round_num,
                        'config_id': config_id,
                        'speaker_name': speaker_name,
                        'order': order
                    })

                    # Build context for this debater
                    formatted_messages = DebateService.format_messages_for_context(
                        all_messages, config_names
                    )
                    system_prompt = DebateService.build_debater_context(
                        topic, formatted_messages, config, speaker_name
                    )
                    user_prompt = DebateService.build_debater_user_prompt(
                        topic, round_num, total_rounds, is_first_in_round=(order == 0)
                    )

                    # Enhance system prompt with user preferences
                    enhanced_prompt = OpenRouterService.build_enhanced_system_prompt(
                        system_prompt, ai_prefs
                    )

                    params = config.get('parameters', {})

                    # Stream response
                    start_time = time.time()
                    full_content = ''
                    prompt_tokens = 0
                    completion_tokens = 0

                    with app.app_context():
                        stream = OpenRouterService.chat_completion(
                            messages=[{'role': 'user', 'content': user_prompt}],
                            model=config['model_id'],
                            system_prompt=enhanced_prompt,
                            temperature=params.get('temperature', 0.7),
                            max_tokens=max_tokens,
                            top_p=params.get('top_p', 1.0),
                            stream=True
                        )

                        for chunk in stream:
                            # Check cancellation
                            if active_debate_generations.get(session_id, {}).get('cancelled'):
                                break

                            if 'error' in chunk:
                                yield sse_event('debate_error', {
                                    'session_id': session_id,
                                    'round': round_num,
                                    'config_id': config_id,
                                    'error': chunk['error'].get('message', 'Unknown error')
                                })
                                return

                            if chunk.get('done'):
                                break

                            choices = chunk.get('choices', [])
                            if choices:
                                delta = choices[0].get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    full_content += content
                                    yield sse_event('debate_message_chunk', {
                                        'session_id': session_id,
                                        'round': round_num,
                                        'config_id': config_id,
                                        'content': content
                                    })

                                usage = chunk.get('usage', {})
                                if usage:
                                    prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                                    completion_tokens = usage.get('completion_tokens', completion_tokens)

                    generation_time = int((time.time() - start_time) * 1000)

                    # Save message to database
                    metadata = {
                        'model_id': config['model_id'],
                        'tokens': {'prompt': prompt_tokens, 'completion': completion_tokens},
                        'generation_time_ms': generation_time
                    }

                    with app.app_context():
                        message = DebateMessageModel.create(
                            session_id=session_id,
                            round_num=round_num,
                            config_id=config_id,
                            role='debater',
                            content=full_content,
                            order_in_round=order,
                            metadata=metadata
                        )

                    # Add to context for next speakers
                    all_messages.append({
                        'round': round_num,
                        'config_id': config_id,
                        'speaker_name': speaker_name,
                        'content': full_content,
                        'role': 'debater'
                    })

                    yield sse_event('debate_message_complete', {
                        'session_id': session_id,
                        'round': round_num,
                        'config_id': config_id,
                        'speaker_name': speaker_name,
                        'content': full_content,
                        'metadata': metadata
                    })

                yield sse_event('debate_round_complete', {
                    'session_id': session_id,
                    'round': round_num
                })

            # Judge phase
            if active_debate_generations.get(session_id, {}).get('cancelled'):
                yield sse_event('debate_error', {'message': 'Debate cancelled'})
                with app.app_context():
                    DebateSessionModel.update_status(session_id, 'cancelled')
                return

            yield sse_event('debate_judge_start', {
                'session_id': session_id,
                'judge_name': judge_config.get('name', 'Judge')
            })

            # Build judge prompt
            formatted_messages = DebateService.format_messages_for_context(
                all_messages, config_names
            )
            judge_system_prompt = DebateService.build_judge_prompt(
                topic, formatted_messages, list(config_names.values())
            )
            judge_user_prompt = DebateService.build_judge_user_prompt()

            # Enhance with user preferences
            enhanced_judge_prompt = OpenRouterService.build_enhanced_system_prompt(
                judge_system_prompt, ai_prefs
            )

            judge_params = judge_config.get('parameters', {})

            # Stream judge response
            start_time = time.time()
            verdict_content = ''
            prompt_tokens = 0
            completion_tokens = 0

            with app.app_context():
                stream = OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': judge_user_prompt}],
                    model=judge_config['model_id'],
                    system_prompt=enhanced_judge_prompt,
                    temperature=judge_params.get('temperature', 0.7),
                    max_tokens=max_tokens * 2,  # Give judge more room
                    top_p=judge_params.get('top_p', 1.0),
                    stream=True
                )

                for chunk in stream:
                    if active_debate_generations.get(session_id, {}).get('cancelled'):
                        break

                    if 'error' in chunk:
                        yield sse_event('debate_error', {
                            'session_id': session_id,
                            'error': chunk['error'].get('message', 'Judge error')
                        })
                        return

                    if chunk.get('done'):
                        break

                    choices = chunk.get('choices', [])
                    if choices:
                        delta = choices[0].get('delta', {})
                        content = delta.get('content', '')
                        if content:
                            verdict_content += content
                            yield sse_event('debate_judge_chunk', {
                                'session_id': session_id,
                                'content': content
                            })

                        usage = chunk.get('usage', {})
                        if usage:
                            prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                            completion_tokens = usage.get('completion_tokens', completion_tokens)

            generation_time = int((time.time() - start_time) * 1000)

            # Save judge verdict
            judge_metadata = {
                'model_id': judge_config['model_id'],
                'tokens': {'prompt': prompt_tokens, 'completion': completion_tokens},
                'generation_time_ms': generation_time
            }

            with app.app_context():
                DebateMessageModel.create(
                    session_id=session_id,
                    round_num=0,  # 0 indicates judge verdict
                    config_id=judge_config_id,
                    role='judge',
                    content=verdict_content,
                    order_in_round=0,
                    metadata=judge_metadata
                )

                # Update session with verdict
                DebateSessionModel.set_verdict(session_id, verdict_content)

            yield sse_event('debate_judge_complete', {
                'session_id': session_id,
                'verdict': verdict_content,
                'metadata': judge_metadata
            })

            yield sse_event('debate_session_complete', {
                'session_id': session_id,
                'status': 'completed'
            })

        except Exception as e:
            yield sse_event('debate_error', {
                'session_id': session_id,
                'error': str(e)
            })
            with app.app_context():
                DebateSessionModel.update_status(session_id, 'cancelled')
        finally:
            # Cleanup
            if session_id in active_debate_generations:
                del active_debate_generations[session_id]

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@debate_stream_bp.route('/cancel/<session_id>', methods=['POST'])
@jwt_required()
def cancel_debate_generation(session_id):
    """Cancel an in-progress debate generation"""
    user = get_current_user()
    user_id = str(user['_id'])

    session = DebateSessionModel.find_by_id(session_id)
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    if str(session['user_id']) != user_id:
        return jsonify({'error': 'Not authorized'}), 403

    if session_id in active_debate_generations:
        active_debate_generations[session_id]['cancelled'] = True
        return jsonify({'success': True, 'message': 'Debate generation cancelled'})

    return jsonify({'error': 'No active generation'}), 404
