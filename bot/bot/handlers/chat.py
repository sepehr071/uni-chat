import asyncio
import time
from aiogram import Router, F
from aiogram.types import Message

from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate
from bot.services.ratelimit import allow_request
from bot.services.chat import prepare_request, call_openrouter_stream, persist_assistant
from bot.services.stream import stream_to_tg_draft, send_full

router = Router()


@router.message(F.text & ~F.text.startswith('/'))
async def on_text(msg: Message):
    user = resolve_user(msg.from_user.id)
    if not user:
        return await msg.answer('Not linked. Open uni-chat → Settings → Telegram.')

    ok, new_state = allow_request(user)
    if not ok:
        return await msg.answer('Slow down — 20 messages per minute limit. Try again shortly.')

    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_rate_limit': new_state})
    invalidate(msg.from_user.id)

    started = time.monotonic()

    try:
        convo, config, history, system = prepare_request(user, msg.text)
    except ValueError as e:
        return await msg.answer(f'Error: {e}', parse_mode=None)

    # P1.1: route bot traffic into the workspace billing rollup via project_id.
    # workspace_id stays None (bot v1 = personal scope per CLAUDE.md).
    usage_out: dict = {}
    sync_gen = call_openrouter_stream(
        history, config['model_id'], system, config.get('parameters') or {},
        user_id=str(user['_id']),
        conversation_id=str(convo['_id']),
        project_id=str(user.get('telegram_active_project_id')) if user.get('telegram_active_project_id') else None,
        usage_out=usage_out,
    )

    error_holder = {}

    async def aiter():
        loop = asyncio.get_event_loop()
        sentinel = object()

        def _next():
            # The generator pushes a Flask app_context internally, but Flask 3
            # uses contextvars and run_in_executor doesn't auto-propagate them
            # to worker threads. Re-push the app_context here so current_app
            # and current_app.config are accessible during each chunk.
            try:
                with flask_app.app_context():
                    return next(sync_gen, sentinel)
            except Exception as e:
                error_holder['exc'] = e
                return sentinel

        while True:
            tok = await loop.run_in_executor(None, _next)
            if tok is sentinel:
                break
            if tok:
                yield tok

    full = await stream_to_tg_draft(msg.bot, msg.chat.id, aiter())

    if error_holder.get('exc'):
        return await msg.answer(f"Error: {error_holder['exc']}", parse_mode=None)
    if not full:
        return await msg.answer('Error: empty response from model.', parse_mode=None)

    await send_full(msg.bot, msg.chat.id, full)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    persist_assistant(
        str(convo['_id']), full, config['model_id'],
        usage_out.get('prompt_tokens', 0),
        usage_out.get('completion_tokens', 0),
        elapsed_ms,
    )
