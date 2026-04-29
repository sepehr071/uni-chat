"""
Telegram streaming via Bot API 9.3+ `sendMessageDraft`.

Drafts are ephemeral previews shown with native streaming animation in the
Telegram client. They return `True` (no message_id), animate transitions
between calls that share the same `draft_id`, and are NOT persisted as
messages on Telegram's side. The caller is responsible for sending the
final real message via `send_full`.

If your account/chat type doesn't support drafts (groups, supergroups,
business connections) Telegram will return an error — `_safe_draft` swallows
it so streaming degrades silently to "preview not animated, final message
still arrives".
"""
import random
from time import monotonic
from typing import AsyncIterator, Callable

from app.utils.telegram_format import md_to_tg_html

BUF_CHARS = 80
BUF_INTERVAL_S = 0.6  # tighter than edit-loop; drafts have no per-message edit cap
TG_MAX = 4000


def _new_draft_id() -> int:
    return random.randint(1, 2**31 - 1)


async def stream_to_tg_draft(bot, chat_id: int, gen: AsyncIterator[str],
                             *, clock: Callable[[], float] = monotonic) -> str:
    """
    Stream tokens from `gen` to Telegram as an animated draft. Returns the
    full assembled text. Does NOT send the final real message — caller must
    do that via `send_full(bot, chat_id, returned_text)`.
    """
    draft_id = _new_draft_id()
    buf = ''
    last_sent_len = 0
    last_emit = clock()

    async for token in gen:
        buf += token
        # Drafts can't span messages; cap the live preview at TG_MAX.
        preview = buf if len(buf) <= TG_MAX else buf[-TG_MAX:]

        if (len(preview) - last_sent_len >= BUF_CHARS) or (clock() - last_emit >= BUF_INTERVAL_S):
            await _safe_draft(bot, chat_id, draft_id, preview)
            last_sent_len = len(preview)
            last_emit = clock()

    return buf


async def send_full(bot, chat_id: int, text: str):
    """
    Send the final assembled text, splitting at TG_MAX (4000) so each piece
    stays under Telegram's 4096-char message cap. Returns the last sent
    Message (useful if caller wants the message_id).
    """
    last = None
    remaining = text
    while remaining:
        chunk, remaining = remaining[:TG_MAX], remaining[TG_MAX:]
        last = await bot.send_message(
            chat_id=chat_id,
            text=md_to_tg_html(chunk) or '…',
            parse_mode='HTML',
        )
    return last


async def _safe_draft(bot, chat_id: int, draft_id: int, text: str):
    html = md_to_tg_html(text) or '…'
    try:
        await bot.send_message_draft(
            chat_id=chat_id,
            draft_id=draft_id,
            text=html,
            parse_mode='HTML',
        )
    except Exception:
        pass
