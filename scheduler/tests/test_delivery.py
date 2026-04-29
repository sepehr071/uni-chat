"""Delivery — verifies fan_out fires only the enabled channels and respects
TG-link presence.
"""
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

import pytest


def _routine(*, chat=False, knowledge=False, telegram=False, with_existing=False):
    rid = ObjectId()
    uid = ObjectId()
    return {
        '_id': rid,
        'user_id': uid,
        'name': 'My Routine',
        'action': {
            'kind': 'chat',
            'prompt': 'hi',
            'config_id': 'quick:openai/gpt-test',
        },
        'outputs': {
            'chat':      {'enabled': chat,      'conversation_id': ObjectId() if with_existing and chat else None},
            'knowledge': {'enabled': knowledge, 'folder_id':       ObjectId() if with_existing and knowledge else None},
            'telegram':  {'enabled': telegram},
        },
    }


@pytest.mark.asyncio
async def test_chat_only(fake_app_models):
    fake_app_models['ConversationModel'].create.return_value = {'_id': ObjectId()}
    fake_app_models['UserModel'].find_by_id.return_value = {'_id': ObjectId(), 'telegram_id': None}

    from scheduler import delivery

    delivered = await delivery.fan_out(
        _routine(chat=True),
        run_id='r1',
        result_text='hello world',
        result_meta={'model': 'openai/gpt-test'},
    )

    assert delivered == ['chat']
    fake_app_models['ConversationModel'].create.assert_called_once()
    fake_app_models['MessageModel'].create_user_message.assert_called_once()
    fake_app_models['MessageModel'].create_assistant_message.assert_called_once()


@pytest.mark.asyncio
async def test_knowledge_only(fake_app_models):
    fake_app_models['KnowledgeFolderModel'].create.return_value = {'_id': ObjectId()}
    fake_app_models['UserModel'].find_by_id.return_value = {'_id': ObjectId(), 'telegram_id': None}

    from scheduler import delivery

    delivered = await delivery.fan_out(
        _routine(knowledge=True),
        run_id='r2',
        result_text='hello world',
        result_meta={'model': 'openai/gpt-test'},
    )

    assert delivered == ['knowledge']
    fake_app_models['KnowledgeFolderModel'].create.assert_called_once()
    fake_app_models['KnowledgeItemModel'].create.assert_called_once()


@pytest.mark.asyncio
async def test_telegram_skipped_when_no_telegram_id(fake_app_models):
    """Telegram channel should silently skip when user has not linked TG."""
    fake_app_models['UserModel'].find_by_id.return_value = {'_id': ObjectId(), 'telegram_id': None}

    from scheduler import delivery

    delivered = await delivery.fan_out(
        _routine(telegram=True),
        run_id='r3',
        result_text='abc',
        result_meta=None,
    )

    assert delivered == []


@pytest.mark.asyncio
async def test_telegram_sends_when_linked(monkeypatch, fake_app_models):
    """Mock aiogram Bot to verify a single send_message call when TG is linked."""
    fake_app_models['UserModel'].find_by_id.return_value = {
        '_id': ObjectId(),
        'telegram_id': 123456789,
    }

    # Inject a fake aiogram package tree.
    fake_aiogram = types.ModuleType('aiogram')
    fake_default_mod = types.ModuleType('aiogram.client.default')
    fake_enums = types.ModuleType('aiogram.enums')

    sent_messages = []

    class FakeBot:
        def __init__(self, token, default=None):
            self.token = token
            self.session = MagicMock()
            self.session.close = AsyncMock()

        async def send_message(self, chat_id, text, parse_mode=None):
            sent_messages.append({'chat_id': chat_id, 'text': text, 'parse_mode': parse_mode})

    class FakeDefaultBotProperties:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class FakeParseMode:
        HTML = 'HTML'

    fake_aiogram.Bot = FakeBot
    fake_default_mod.DefaultBotProperties = FakeDefaultBotProperties
    fake_enums.ParseMode = FakeParseMode

    monkeypatch.setitem(sys.modules, 'aiogram', fake_aiogram)
    monkeypatch.setitem(sys.modules, 'aiogram.client', types.ModuleType('aiogram.client'))
    monkeypatch.setitem(sys.modules, 'aiogram.client.default', fake_default_mod)
    monkeypatch.setitem(sys.modules, 'aiogram.enums', fake_enums)

    # Tell scheduler.settings to think TELEGRAM_BOT_TOKEN is set.
    from scheduler import settings as settings_mod
    monkeypatch.setattr(settings_mod.settings, 'telegram_bot_token', 'tg-token-test')

    from scheduler import delivery

    delivered = await delivery.fan_out(
        _routine(telegram=True),
        run_id='r4',
        result_text='one short message',
        result_meta=None,
    )

    assert delivered == ['telegram']
    assert len(sent_messages) == 1
    assert sent_messages[0]['chat_id'] == 123456789
    assert '🔔 [Routine: My Routine]' in sent_messages[0]['text']
    assert sent_messages[0]['parse_mode'] == 'HTML'


@pytest.mark.asyncio
async def test_all_three_channels_when_all_enabled(monkeypatch, fake_app_models):
    fake_app_models['ConversationModel'].create.return_value = {'_id': ObjectId()}
    fake_app_models['KnowledgeFolderModel'].create.return_value = {'_id': ObjectId()}
    fake_app_models['UserModel'].find_by_id.return_value = {
        '_id': ObjectId(),
        'telegram_id': 555,
    }

    # Stub aiogram (success path)
    fake_aiogram = types.ModuleType('aiogram')

    class FakeBot:
        def __init__(self, token, default=None):
            self.session = MagicMock()
            self.session.close = AsyncMock()

        async def send_message(self, **_):
            pass

    fake_aiogram.Bot = FakeBot
    fake_default_mod = types.ModuleType('aiogram.client.default')
    fake_default_mod.DefaultBotProperties = lambda **kw: kw
    fake_enums = types.ModuleType('aiogram.enums')

    class FakeParseMode:
        HTML = 'HTML'

    fake_enums.ParseMode = FakeParseMode

    monkeypatch.setitem(sys.modules, 'aiogram', fake_aiogram)
    monkeypatch.setitem(sys.modules, 'aiogram.client', types.ModuleType('aiogram.client'))
    monkeypatch.setitem(sys.modules, 'aiogram.client.default', fake_default_mod)
    monkeypatch.setitem(sys.modules, 'aiogram.enums', fake_enums)

    from scheduler import settings as settings_mod
    monkeypatch.setattr(settings_mod.settings, 'telegram_bot_token', 'tg-token-test')

    from scheduler import delivery

    delivered = await delivery.fan_out(
        _routine(chat=True, knowledge=True, telegram=True),
        run_id='r5',
        result_text='multi-out',
        result_meta=None,
    )

    assert set(delivered) == {'chat', 'knowledge', 'telegram'}
