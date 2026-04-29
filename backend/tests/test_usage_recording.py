"""
Tests for usage recording inside OpenRouterService._sync_completion and
_stream_completion.

HTTP calls to OpenRouter are intercepted with unittest.mock.patch so no real
network traffic occurs.
"""

import json
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sync_response(model: str, prompt_tokens: int, completion_tokens: int,
                   cost: float | None = None) -> MagicMock:
    """Build a mock requests.Response for a sync chat completion."""
    usage: dict = {
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
    }
    if cost is not None:
        usage['cost'] = cost

    payload = {
        'id': 'chatcmpl-test',
        'model': model,
        'choices': [
            {'message': {'role': 'assistant', 'content': 'Hello!'}, 'finish_reason': 'stop'}
        ],
        'usage': usage,
    }
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = payload
    return mock_resp


def _stream_lines(model: str, prompt_tokens: int, completion_tokens: int,
                  cost: float | None = None) -> list[bytes]:
    """Return SSE line bytes mimicking an OpenRouter streaming response."""
    chunk1 = json.dumps({'model': model, 'choices': [
        {'delta': {'role': 'assistant', 'content': 'Hello'}, 'finish_reason': None}
    ]})
    usage: dict = {
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
    }
    if cost is not None:
        usage['cost'] = cost
    chunk_usage = json.dumps({'model': model, 'choices': [], 'usage': usage})

    lines = [
        f'data: {chunk1}'.encode(),
        b'',
        f'data: {chunk_usage}'.encode(),
        b'',
        b'data: [DONE]',
    ]
    return lines


def _mock_stream_response(lines: list[bytes]) -> MagicMock:
    """Build a mock requests.Response for a streaming call."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.iter_lines.return_value = iter(lines)
    return mock_resp


def _count_usage_logs(db) -> int:
    return db['usage_logs'].count_documents({})


def _get_usage_doc(db) -> dict | None:
    return db['usage_logs'].find_one({})


# ---------------------------------------------------------------------------
# (a) Sync completion — usage logged with cost from response
# ---------------------------------------------------------------------------

class TestSyncUsageRecording:
    def test_usage_doc_inserted_with_cost(self, app, db, test_user):
        """Sync call with user_id, conversation_id, feature → exactly one doc with correct cost."""
        user_id = str(test_user['_id'])
        conv_id = str(ObjectId())

        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            mock_resp = _sync_response('openai/gpt-test', 100, 50, cost=0.0042)
            with patch('requests.post', return_value=mock_resp):
                OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='openai/gpt-test',
                    user_id=user_id,
                    conversation_id=conv_id,
                    feature='chat',
                )

        assert _count_usage_logs(db) == 1
        doc = _get_usage_doc(db)
        assert doc is not None
        assert abs(doc['cost_usd'] - 0.0042) < 1e-9
        assert doc['feature'] == 'chat'
        assert doc['model_id'] == 'openai/gpt-test'
        assert doc['prompt_tokens'] == 100
        assert doc['completion_tokens'] == 50

    def test_usage_doc_has_conversation_id(self, app, db, test_user):
        user_id = str(test_user['_id'])
        conv_id = str(ObjectId())

        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            mock_resp = _sync_response('openai/gpt-test', 10, 5, cost=0.001)
            with patch('requests.post', return_value=mock_resp):
                OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='openai/gpt-test',
                    user_id=user_id,
                    conversation_id=conv_id,
                )

        doc = _get_usage_doc(db)
        assert doc is not None
        assert str(doc['conversation_id']) == conv_id


# ---------------------------------------------------------------------------
# (b) Cost absent from response — fallback to pricing × tokens
# ---------------------------------------------------------------------------

class TestCostFallback:
    def test_cost_computed_from_registry_pricing(self, app, db, test_user):
        """When response.usage has no 'cost', pricing×tokens provides cost_usd."""
        user_id = str(test_user['_id'])

        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            # Seed pricing: prompt=2e-6/tok, completion=4e-6/tok
            OpenRouterModelDoc.upsert_many([{
                'id': 'priced/model',
                'name': 'Priced Model',
                'architecture': {
                    'input_modalities': ['text'],
                    'output_modalities': ['text'],
                },
                'supported_parameters': [],
                'pricing': {'prompt': '0.000002', 'completion': '0.000004'},
            }])

            from app.services.openrouter_service import OpenRouterService

            # No 'cost' key in usage
            mock_resp = _sync_response('priced/model', 500, 200, cost=None)
            with patch('requests.post', return_value=mock_resp):
                OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='priced/model',
                    user_id=user_id,
                )

        doc = _get_usage_doc(db)
        assert doc is not None
        # 500 * 2e-6 + 200 * 4e-6 = 0.001 + 0.0008 = 0.0018
        expected = 500 * 0.000002 + 200 * 0.000004
        assert abs(doc['cost_usd'] - expected) < 1e-9


# ---------------------------------------------------------------------------
# (c) user_id=None — silent skip, no usage_logs doc
# ---------------------------------------------------------------------------

class TestNoUserIdSkip:
    def test_no_doc_when_user_id_none(self, app, db):
        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            mock_resp = _sync_response('openai/gpt-test', 100, 50, cost=0.005)
            with patch('requests.post', return_value=mock_resp):
                OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='openai/gpt-test',
                    user_id=None,
                )

        assert _count_usage_logs(db) == 0


# ---------------------------------------------------------------------------
# (d) Streaming — usage logged after stream consumed
# ---------------------------------------------------------------------------

class TestStreamUsageRecording:
    def test_usage_doc_inserted_after_stream(self, app, db, test_user):
        """Streaming final usage chunk → doc inserted once generator exhausted."""
        user_id = str(test_user['_id'])
        conv_id = str(ObjectId())

        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            lines = _stream_lines('stream/model', 80, 40, cost=0.002)
            mock_resp = _mock_stream_response(lines)
            with patch('requests.post', return_value=mock_resp):
                gen = OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='stream/model',
                    stream=True,
                    user_id=user_id,
                    conversation_id=conv_id,
                    feature='chat',
                )
                # Consume the full generator
                chunks = list(gen)

        assert _count_usage_logs(db) == 1
        doc = _get_usage_doc(db)
        assert doc is not None
        assert abs(doc['cost_usd'] - 0.002) < 1e-9
        assert doc['prompt_tokens'] == 80
        assert doc['completion_tokens'] == 40
        assert doc['feature'] == 'chat'

    def test_no_doc_when_user_id_none_streaming(self, app, db):
        """Streaming with user_id=None → no usage doc."""
        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            lines = _stream_lines('stream/model', 80, 40, cost=0.002)
            mock_resp = _mock_stream_response(lines)
            with patch('requests.post', return_value=mock_resp):
                gen = OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='stream/model',
                    stream=True,
                    user_id=None,
                )
                list(gen)

        assert _count_usage_logs(db) == 0

    def test_stream_no_usage_chunk_no_doc(self, app, db, test_user):
        """Streaming with no usage chunk in response → no usage doc (usage=None)."""
        user_id = str(test_user['_id'])

        with app.app_context():
            from app.services.openrouter_service import OpenRouterService

            # No usage chunk — just content + DONE
            chunk1 = json.dumps({'model': 'stream/model', 'choices': [
                {'delta': {'role': 'assistant', 'content': 'Hello'}, 'finish_reason': None}
            ]})
            lines = [
                f'data: {chunk1}'.encode(),
                b'data: [DONE]',
            ]
            mock_resp = _mock_stream_response(lines)
            with patch('requests.post', return_value=mock_resp):
                gen = OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': 'Hi'}],
                    model='stream/model',
                    stream=True,
                    user_id=user_id,
                )
                list(gen)

        # _record_usage no-ops when response_usage is None
        assert _count_usage_logs(db) == 0
