import asyncio
from unittest.mock import AsyncMock, MagicMock
import pytest
from bot.services.stream import stream_to_tg, BUF_CHARS


class FakeClock:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
    def advance(self, dt): self.t += dt


@pytest.mark.asyncio
async def test_batches_small_chunks_into_one_edit(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.edit_message_text = AsyncMock()

    async def gen():
        for c in 'abcdef':
            yield c

    out = await stream_to_tg(bot, chat_id=1, message_id=10, gen=gen(), clock=clock)
    assert out == 'abcdef'
    assert bot.edit_message_text.call_count == 1


@pytest.mark.asyncio
async def test_emits_edit_on_buffer_threshold(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr('bot.services.stream.monotonic', clock)
    bot = MagicMock()
    bot.edit_message_text = AsyncMock()

    async def gen():
        yield 'x' * (BUF_CHARS + 5)
        yield 'y' * (BUF_CHARS + 5)

    out = await stream_to_tg(bot, chat_id=1, message_id=10, gen=gen(), clock=clock)
    assert bot.edit_message_text.call_count >= 2
    assert out == 'x' * (BUF_CHARS + 5) + 'y' * (BUF_CHARS + 5)
