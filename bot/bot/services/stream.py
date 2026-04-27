"""Adaptive Telegram-message edit batching for streamed LLM tokens."""
from time import monotonic
from typing import AsyncIterator, Callable

from bot.services.format import md_to_tg_html

BUF_CHARS = 80
BUF_INTERVAL_S = 1.2
TG_MAX = 4000


async def stream_to_tg(bot, chat_id: int, message_id: int, gen: AsyncIterator[str],
                       *, clock: Callable[[], float] = monotonic) -> str:
    """
    Edit `message_id` in `chat_id` as `gen` yields tokens.
    Returns the full assembled text.
    """
    buf = ''
    last_sent_len = 0
    last_edit = clock()
    current_msg_id = message_id

    async for token in gen:
        buf += token

        if len(buf) > TG_MAX:
            head, buf = buf[:TG_MAX], buf[TG_MAX:]
            await _safe_edit(bot, chat_id, current_msg_id, head)
            sent = await bot.send_message(chat_id, '…')
            current_msg_id = sent.message_id
            last_sent_len = 0
            last_edit = clock()
            continue

        if (len(buf) - last_sent_len >= BUF_CHARS) or (clock() - last_edit >= BUF_INTERVAL_S):
            await _safe_edit(bot, chat_id, current_msg_id, buf)
            last_sent_len = len(buf)
            last_edit = clock()

    if buf:
        await _safe_edit(bot, chat_id, current_msg_id, buf)
    return buf


async def _safe_edit(bot, chat_id: int, message_id: int, text: str):
    html = md_to_tg_html(text) or '…'
    try:
        await bot.edit_message_text(text=html, chat_id=chat_id, message_id=message_id)
    except Exception:
        pass
