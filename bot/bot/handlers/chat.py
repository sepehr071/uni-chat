import asyncio
import time
from aiogram import Router, F
from aiogram.types import Message

from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate
from bot.services.ratelimit import allow_request
from bot.services.chat import prepare_request, call_openrouter_stream, persist_assistant
from bot.services.stream import stream_to_tg

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

    placeholder = await msg.answer('…')
    started = time.monotonic()

    try:
        convo, config, history, system = prepare_request(user, msg.text)
    except ValueError as e:
        return await placeholder.edit_text(f'Error: {e}')

    sync_gen = call_openrouter_stream(history, config['model_id'], system, config.get('parameters') or {})

    error_holder = {}

    async def aiter():
        loop = asyncio.get_event_loop()
        sentinel = object()

        def _next():
            try:
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

    full = await stream_to_tg(msg.bot, msg.chat.id, placeholder.message_id, aiter())

    if error_holder.get('exc'):
        return await placeholder.edit_text(f"Error: {error_holder['exc']}")
    if not full:
        return await placeholder.edit_text('Error: empty response from model.')

    elapsed_ms = int((time.monotonic() - started) * 1000)
    persist_assistant(str(convo['_id']), full, config['model_id'], 0, 0, elapsed_ms)
