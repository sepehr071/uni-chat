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
