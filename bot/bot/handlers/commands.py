from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from app.models.user import UserModel
from app.models.conversation import ConversationModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate

router = Router()

HELP_TEXT = (
    '<b>uni-chat bot</b>\n\n'
    '/new — fresh conversation\n'
    '/model — pick a model\n'
    '/assistant — pick a saved assistant\n'
    '/history — recent conversations\n'
    '/unlink — disconnect this account\n'
    '/help — this message\n'
)


def _require_linked(msg: Message):
    user = resolve_user(msg.from_user.id)
    if not user:
        return None
    return user


@router.message(Command('help'))
async def cmd_help(msg: Message):
    await msg.answer(HELP_TEXT)


@router.message(Command('new'))
async def cmd_new(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked. Open uni-chat → Settings → Telegram.')
    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_conversation_id': None})
    invalidate(msg.from_user.id)
    await msg.answer('New conversation. Send a message to begin.')


@router.message(Command('history'))
async def cmd_history(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        convos = ConversationModel.find_by_user(str(user['_id']), limit=10)
    if not convos:
        return await msg.answer('No conversations yet.')
    lines = ['<b>Recent conversations</b>']
    for c in convos:
        title = c.get('title') or 'Untitled'
        lines.append(f'• {title} ({c["message_count"]} msgs)')
    await msg.answer('\n'.join(lines))


@router.message(Command('unlink'))
async def cmd_unlink(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Already unlinked.')
    with flask_app.app_context():
        UserModel.clear_telegram_link(str(user['_id']))
    invalidate(msg.from_user.id)
    await msg.answer('Unlinked. /start to relink anytime.')


from aiogram.types import CallbackQuery
from app.models.llm_config import LLMConfigModel
from bot.keyboards import model_picker


# Bot is personal-scoped in v1; project assistants are intentionally hidden
# from DMs to avoid leaking team data into Telegram. We filter `project_id is
# None` (covers both legacy docs missing the field and explicit personal docs).
def _personal_only(configs):
    return [c for c in (configs or []) if not c.get('project_id')]


@router.message(Command('model'))
async def cmd_model(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = _personal_only(LLMConfigModel.find_by_owner(str(user['_id']), limit=10))
    await msg.answer('Pick a model:', reply_markup=model_picker(assistants))


@router.message(Command('assistant'))
async def cmd_assistant(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = _personal_only(LLMConfigModel.find_by_owner(str(user['_id']), limit=10))
    if not assistants:
        return await msg.answer('No saved assistants. Create one in uni-chat web app.')
    await msg.answer('Pick an assistant:', reply_markup=model_picker(assistants[:10]))


@router.callback_query(lambda c: c.data and c.data.startswith('cfg:'))
async def on_pick_config(cb: CallbackQuery):
    user = resolve_user(cb.from_user.id)
    if not user:
        return await cb.answer('Not linked.', show_alert=True)
    cfg_id = cb.data[len('cfg:'):]
    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_config_id': cfg_id})
    invalidate(cb.from_user.id)
    await cb.answer('Set.')
    await cb.message.edit_text(f'Active model: <code>{cfg_id}</code>')
