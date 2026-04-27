from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message
from app.models.telegram_link_token import TelegramLinkTokenModel
from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import invalidate as invalidate_cache

router = Router()


@router.message(CommandStart(deep_link=True))
async def start_with_token(msg: Message, command: CommandObject):
    token = (command.args or '').strip()
    if not token:
        return await start_plain(msg)

    with flask_app.app_context():
        user_id = TelegramLinkTokenModel.consume(token)
        if not user_id:
            return await msg.answer('Link expired or invalid. Generate a new one in uni-chat → Settings → Telegram.')
        UserModel.set_telegram_link(user_id, msg.from_user.id, msg.from_user.username)

    invalidate_cache(msg.from_user.id)
    name = msg.from_user.username or msg.from_user.first_name or 'there'
    await msg.answer(f'Linked, @{name}. Send a message to start chatting, or /help for commands.')


@router.message(CommandStart())
async def start_plain(msg: Message):
    await msg.answer(
        '<b>uni-chat bot</b>\n\n'
        'Open uni-chat → Settings → Telegram and click "Link Telegram" to connect this account.'
    )
