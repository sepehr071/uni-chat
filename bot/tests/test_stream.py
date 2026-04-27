from unittest.mock import AsyncMock, MagicMock
import pytest

from bot.services.stream import stream_to_tg_draft, send_full, BUF_CHARS, TG_MAX


class FakeClock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
    def advance(self, dt): self.t += dt


@pytest.mark.asyncio
async def test_small_chunks_under_threshold_emit_zero_drafts(monkeypatch):
    """Small buffer + no time advance: stream yields no drafts mid-flight.
    Final text returned to caller, who calls send_full separately."""
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.send_message_draft = AsyncMock()

    async def gen():
        for c in 'abcdef':
            yield c

    out = await stream_to_tg_draft(bot, chat_id=1, gen=gen(), clock=clock)
    assert out == 'abcdef'
    assert bot.send_message_draft.call_count == 0


@pytest.mark.asyncio
async def test_buffer_threshold_triggers_draft(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.send_message_draft = AsyncMock()

    async def gen():
        yield 'x' * (BUF_CHARS + 5)
        yield 'y' * (BUF_CHARS + 5)

    out = await stream_to_tg_draft(bot, chat_id=1, gen=gen(), clock=clock)
    assert out == 'x' * (BUF_CHARS + 5) + 'y' * (BUF_CHARS + 5)
    assert bot.send_message_draft.call_count >= 2


@pytest.mark.asyncio
async def test_draft_id_stable_across_calls(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.send_message_draft = AsyncMock()

    async def gen():
        for _ in range(5):
            yield 'z' * (BUF_CHARS + 1)

    await stream_to_tg_draft(bot, chat_id=1, gen=gen(), clock=clock)
    ids = [call.kwargs['draft_id'] for call in bot.send_message_draft.call_args_list]
    assert len(ids) >= 2
    assert len(set(ids)) == 1, f"draft_id changed across calls: {ids}"


@pytest.mark.asyncio
async def test_send_full_splits_long_text():
    bot = MagicMock()
    bot.send_message = AsyncMock()
    text = 'a' * (TG_MAX * 2 + 100)
    await send_full(bot, chat_id=1, text=text)
    assert bot.send_message.call_count == 3


@pytest.mark.asyncio
async def test_send_full_single_chunk():
    bot = MagicMock()
    bot.send_message = AsyncMock()
    await send_full(bot, chat_id=1, text='hello')
    assert bot.send_message.call_count == 1
