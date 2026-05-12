"""Fan-out the result of a routine run to its enabled output channels.

Channels (each independently toggleable via routine.outputs.*):
    - chat        → existing or auto-created Conversation in /chat
    - knowledge   → existing or auto-created folder in Knowledge Vault
    - telegram    → DM via aiogram.Bot, only if user.telegram_id is linked

Returns the list of channel names successfully delivered to. Individual channel
failures are logged but never abort the others.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from scheduler.flask_ctx import flask_app
from scheduler.settings import settings

logger = logging.getLogger('unichat-scheduler.delivery')


def _persist_routine_outputs(routine_id: str, outputs: dict) -> None:
    """Persist auto-created conversation/folder ids back to the routine doc."""
    from app.models.routine import RoutineModel

    RoutineModel.get_collection().update_one(
        {'_id': ObjectId(routine_id)},
        {'$set': {'outputs': outputs, 'updated_at': datetime.now(timezone.utc)}},
    )


# ---------------------------------------------------------------------------
# Channel: chat
# ---------------------------------------------------------------------------

def _deliver_chat(routine: dict, result_text: str, prompt: str, model_id: str) -> bool:
    """Append a user-prompt + assistant-result pair into the routine's chat conversation.

    Auto-creates the conversation on first run and persists the id back onto
    the routine. Returns True on success.
    """
    from app.models.conversation import ConversationModel
    from app.models.message import MessageModel

    outputs = routine.get('outputs') or {}
    chat_out = outputs.get('chat') or {}
    if not chat_out.get('enabled'):
        return False

    user_id = routine['user_id']
    routine_id = str(routine['_id'])
    config_id = routine.get('action', {}).get('config_id') or f'quick:{model_id}'
    conversation_id = chat_out.get('conversation_id')

    if not conversation_id:
        conv = ConversationModel.create(
            user_id=user_id,
            config_id=config_id,
            title=routine.get('name') or 'Routine',
        )
        conversation_id = conv['_id']
        # persist back
        outputs.setdefault('chat', {})['conversation_id'] = conversation_id
        _persist_routine_outputs(routine_id, outputs)

    # Append user prompt + assistant reply
    MessageModel.create_user_message(conversation_id, prompt or '(routine prompt)')
    MessageModel.create_assistant_message(
        conversation_id=conversation_id,
        content=result_text,
        model_id=model_id,
    )
    ConversationModel.increment_message_count(conversation_id)
    ConversationModel.increment_message_count(conversation_id)
    return True


# ---------------------------------------------------------------------------
# Channel: knowledge
# ---------------------------------------------------------------------------

def _deliver_knowledge(routine: dict, result_text: str) -> bool:
    """Save the result as a KnowledgeItem inside the routine's auto-created folder."""
    from app.models.knowledge_folder import KnowledgeFolderModel
    from app.models.knowledge_item import KnowledgeItemModel

    outputs = routine.get('outputs') or {}
    kn_out = outputs.get('knowledge') or {}
    if not kn_out.get('enabled'):
        return False

    user_id = routine['user_id']
    routine_id = str(routine['_id'])
    name = routine.get('name') or 'Routine'
    folder_id = kn_out.get('folder_id')

    if not folder_id:
        folder = KnowledgeFolderModel.create(user_id=user_id, name=name, color='#5c9aed')
        folder_id = folder['_id']
        outputs.setdefault('knowledge', {})['folder_id'] = folder_id
        _persist_routine_outputs(routine_id, outputs)

    iso_date = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    # P2.38 — tag knowledge items written by the scheduler with source_type='routine'
    # so dashboards can distinguish auto-generated knowledge from manual chat saves.
    KnowledgeItemModel.create(
        user_id=user_id,
        source_type='routine',
        source_id=str(routine_id),
        message_id=None,
        content=result_text,
        title=f"{name} — {iso_date}",
        folder_id=str(folder_id) if folder_id else None,
    )
    return True


# ---------------------------------------------------------------------------
# Channel: telegram
# ---------------------------------------------------------------------------

async def _deliver_telegram(routine: dict, result_text: str, user_doc: Optional[dict]) -> bool:
    """Send the routine result as a Telegram DM. Skips when user is not linked."""
    if not user_doc:
        return False
    telegram_id = user_doc.get('telegram_id')
    if not telegram_id:
        return False

    outputs = routine.get('outputs') or {}
    tg_out = outputs.get('telegram') or {}
    if not tg_out.get('enabled'):
        return False

    if not settings.telegram_bot_token:
        logger.warning('routine %s telegram delivery requested but TELEGRAM_BOT_TOKEN is empty',
                       routine.get('_id'))
        return False

    # Lazy import — keeps unit tests free of the aiogram dep when mocking.
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode

    # NOTE: import via backend's installed package — same util both bot/ and scheduler/ share.
    from app.utils.telegram_format import md_to_tg_html, split_for_telegram

    name = routine.get('name') or 'Routine'
    bot = Bot(
        token=settings.telegram_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        chunks = split_for_telegram(result_text or '(no output)')
        for idx, chunk in enumerate(chunks):
            html = md_to_tg_html(chunk)
            if idx == 0:
                # Prefix only on first chunk; HTML-escape the routine name's special chars
                from html import escape as _esc
                text = f'🔔 [Routine: {_esc(name)}]\n\n{html}'
            else:
                text = html
            await bot.send_message(chat_id=telegram_id, text=text, parse_mode='HTML')
        return True
    except Exception as exc:
        logger.warning('telegram delivery failed for routine %s: %s', routine.get('_id'), exc)
        return False
    finally:
        # P2.39 — bot.session.close() alone doesn't release the underlying
        # aiohttp TCPConnector → FDs leak across runs. Close the connector
        # explicitly first, then the session. Both wrapped in try-blocks so a
        # missing attribute (older aiogram) doesn't tank delivery accounting.
        try:
            session = getattr(bot, 'session', None)
            connector = getattr(session, 'connector', None) if session else None
            if connector is not None:
                try:
                    await connector.close()
                except Exception:
                    pass
            if session is not None:
                await session.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------

async def fan_out(
    routine: dict,
    run_id: str,
    result_text: str,
    result_meta: Optional[dict] = None,
) -> list[str]:
    """Dispatch the result to every enabled output channel.

    Returns the list of channel names that succeeded. Caller is expected to
    pass this into RoutineRunModel.complete(delivered_to=...).

    All synchronous backend model calls are wrapped in `flask_app.app_context()`.
    The Telegram channel runs outside that context (it's network-only / aiogram).
    """
    from app.models.user import UserModel

    delivered: list[str] = []
    action = routine.get('action') or {}
    prompt = action.get('prompt', '')
    model_id = (result_meta or {}).get('model') or 'unknown'

    # Sync channels (chat, knowledge) — single app_context covers both.
    with flask_app.app_context():
        try:
            user_doc = UserModel.find_by_id(routine['user_id'])
        except Exception:
            user_doc = None

        try:
            if _deliver_chat(routine, result_text, prompt, model_id):
                delivered.append('chat')
        except Exception as exc:
            logger.warning('chat delivery failed for routine %s: %s', routine.get('_id'), exc)

        try:
            if _deliver_knowledge(routine, result_text):
                delivered.append('knowledge')
        except Exception as exc:
            logger.warning('knowledge delivery failed for routine %s: %s', routine.get('_id'), exc)

    # Async telegram channel — outside app_context (no DB calls).
    try:
        if await _deliver_telegram(routine, result_text, user_doc):
            delivered.append('telegram')
    except Exception as exc:
        logger.warning('telegram delivery failed for routine %s: %s', routine.get('_id'), exc)

    return delivered
