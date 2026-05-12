from aiogram import F, Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from app.models.telegram_link_token import TelegramLinkTokenModel
from app.models.user import UserModel
from bot.flask_ctx import flask_app
from bot.services.auth import invalidate as invalidate_cache

router = Router()


def _mask_email(email: str) -> str:
    """Show only the first and last char of the local part to confirm identity
    without revealing the address: ``a***z@gmail.com``."""
    if not email or '@' not in email:
        return '(unknown)'
    local, _, domain = email.partition('@')
    if len(local) <= 2:
        return f'{local}@{domain}'
    return f'{local[0]}{"*" * (len(local) - 2)}{local[-1]}@{domain}'


@router.message(CommandStart(deep_link=True))
async def start_with_token(msg: Message, command: CommandObject):
    """Telegram link deep-link entry point (P0.13).

    Previously consumed the token immediately, so anyone who got their hands
    on the URL — even via a screenshot leak — was instantly linked to the
    generator's account. Now we *peek* the token, show a masked confirmation
    of which uni-chat account is about to be bound, and only commit when the
    Telegram user clicks the inline Confirm button.
    """
    token = (command.args or '').strip()
    if not token:
        return await start_plain(msg)

    with flask_app.app_context():
        user_id = TelegramLinkTokenModel.peek(token)
        target_email = None
        if user_id:
            target = UserModel.find_by_id(user_id)
            if target:
                target_email = target.get('email')

    if not user_id:
        return await msg.answer('Link expired or invalid. Generate a new one in uni-chat → Settings → Telegram.')

    masked = _mask_email(target_email or '')
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text='Confirm link', callback_data=f'tglink:{token}'),
        InlineKeyboardButton(text='Cancel', callback_data='tglink:cancel'),
    ]])
    await msg.answer(
        'You are about to link this Telegram account to uni-chat user '
        f'<b>{masked}</b>.\n\n'
        'If this is not your account, tap Cancel.',
        reply_markup=kb,
    )


@router.callback_query(F.data.startswith('tglink:'))
async def on_link_confirm(cb: CallbackQuery):
    payload = cb.data[len('tglink:'):]
    if payload == 'cancel':
        await cb.answer('Cancelled.')
        try:
            await cb.message.edit_text('Link cancelled. No account was bound.')
        except Exception:
            pass
        return

    token = payload
    with flask_app.app_context():
        user_id = TelegramLinkTokenModel.consume(token)
        if not user_id:
            await cb.answer('Link expired.', show_alert=True)
            try:
                await cb.message.edit_text('Link expired or invalid. Generate a new one in uni-chat → Settings → Telegram.')
            except Exception:
                pass
            return
        UserModel.set_telegram_link(user_id, cb.from_user.id, cb.from_user.username)

    invalidate_cache(cb.from_user.id)
    name = cb.from_user.username or cb.from_user.first_name or 'there'
    await cb.answer('Linked.')
    try:
        await cb.message.edit_text(f'Linked, @{name}. Send a message to start chatting, or /help for commands.')
    except Exception:
        pass


@router.message(CommandStart())
async def start_plain(msg: Message):
    await msg.answer(
        '<b>uni-chat bot</b>\n\n'
        'Open uni-chat → Settings → Telegram and click "Link Telegram" to connect this account.'
    )
