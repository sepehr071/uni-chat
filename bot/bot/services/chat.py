"""Glue: take a Telegram text message, persist user msg, stream OpenRouter, persist assistant."""
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.project import ProjectModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService
from app.utils.config_resolver import resolve_config
from bot.flask_ctx import flask_app

DEFAULT_QUICK = 'quick:google/gemini-3-flash-preview'


def _ensure_active_conversation(user: dict, config_id: str) -> dict:
    """Get or create the user's active Telegram conversation."""
    cid = user.get('telegram_active_conversation_id')
    with flask_app.app_context():
        if cid:
            convo = ConversationModel.find_by_id(cid)
            if convo:
                return convo
        convo = ConversationModel.create(str(user['_id']), config_id, title='Telegram chat')
        UserModel.update(str(user['_id']), {'telegram_active_conversation_id': str(convo['_id'])})
    return convo


def prepare_request(user: dict, text: str) -> tuple[dict, dict, list[dict], str]:
    """Returns (convo, config, messages, system_prompt). All MongoDB ops use Flask context."""
    cfg_id = user.get('telegram_active_config_id') or DEFAULT_QUICK
    pid = user.get('telegram_active_project_id')
    with flask_app.app_context():
        config = resolve_config(cfg_id, user_id=str(user['_id']), project_id=pid)
        if not config:
            raise ValueError(f'Unknown config_id: {cfg_id}')
        convo = _ensure_active_conversation(user, cfg_id)
        MessageModel.create_user_message(str(convo['_id']), text)
        history = MessageModel.get_context_messages(str(convo['_id']), limit=20)
        formatted = OpenRouterService.format_messages_for_api(history)
        system = OpenRouterService.build_enhanced_system_prompt(
            config.get('system_prompt') or '',
            UserModel.get_ai_preferences(str(user['_id'])),
        )
    return convo, config, formatted, system


def call_openrouter_stream(messages, model, system_prompt, params: dict,
                           user_id: str | None = None,
                           conversation_id: str | None = None,
                           project_id: str | None = None,
                           usage_out: dict | None = None):
    """
    Yields token strings (sync generator from OpenRouterService).
    Raises RuntimeError on upstream error.

    NOTE: caller is responsible for pushing a Flask app_context around each
    call to next(). Pushing one inside this generator would leave it on the
    LIFO stack across yields, colliding with the caller's per-chunk context
    push and triggering "Popped wrong app context" once the handler exits
    its own `with` block. See plan: use-zip-it-unified-avalanche.md.

    P1.1: pass ``project_id`` for billing rollup attribution. workspace_id
    is resolved from the project for forward-compat / accurate holding rollup
    (CLAUDE.md mandate: every OpenRouterService call passes workspace_id +
    project_id + origin). Falls back to None when no active project.
    """
    project = ProjectModel.find_by_id(project_id) if project_id else None
    workspace_id = str(project['workspace_id']) if project and project.get('workspace_id') else None
    gen = OpenRouterService.chat_completion(
        messages=messages,
        model=model,
        system_prompt=system_prompt,
        stream=True,
        temperature=params.get('temperature', 0.7),
        max_tokens=params.get('max_tokens', 2048),
        user_id=user_id,
        conversation_id=conversation_id,
        project_id=project_id,
        workspace_id=workspace_id,
        feature='chat',
        origin='telegram',
    )
    for chunk in gen:
        if not isinstance(chunk, dict):
            continue
        if 'error' in chunk:
            err = chunk['error']
            raise RuntimeError(f"OpenRouter {err.get('code')}: {err.get('message')}")
        if chunk.get('done'):
            # P1.2: capture token counts from the final SSE chunk before exit
            # so the caller can persist real numbers on the assistant message
            # row (instead of always-zero defaults).
            if usage_out is not None:
                usage = chunk.get('usage') or {}
                usage_out['prompt_tokens'] = int(usage.get('prompt_tokens') or 0)
                usage_out['completion_tokens'] = int(usage.get('completion_tokens') or 0)
            break
        choices = chunk.get('choices') or []
        if choices and 'delta' in choices[0]:
            yield choices[0]['delta'].get('content') or ''


def persist_assistant(convo_id: str, content: str, model_id: str, prompt_tokens: int, completion_tokens: int, gen_ms: int):
    """Persist the assistant turn.

    P1.2: tokens are recorded in ``usage_logs`` by ``OpenRouterService._record_usage``
    from the SSE final chunk; pass them through here so the per-message metadata
    (visible in conversation view) shows real counts instead of zeros.
    """
    with flask_app.app_context():
        MessageModel.create_assistant_message(
            convo_id, content,
            model_id=model_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            generation_time_ms=gen_ms,
        )
        ConversationModel.increment_message_count(convo_id, prompt_tokens, completion_tokens)
