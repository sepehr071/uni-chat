"""
Tests for ModelRegistryService — refresh, get, find_by_modality,
find_by_capability, get_pricing, is_image_capable, is_stale.

All HTTP calls are stubbed via unittest.mock.patch to avoid real network traffic.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_model_item(
    model_id: str,
    input_modalities: list | None = None,
    output_modalities: list | None = None,
    supported_parameters: list | None = None,
    pricing: dict | None = None,
    expiration_date: str | None = None,
) -> dict:
    """Build a minimal OpenRouter /api/v1/models item dict."""
    return {
        'id': model_id,
        'name': model_id,
        'context_length': 8192,
        'architecture': {
            'input_modalities': input_modalities or ['text'],
            'output_modalities': output_modalities or ['text'],
        },
        'supported_parameters': supported_parameters or [],
        'pricing': pricing or {'prompt': '0.000001', 'completion': '0.000002'},
        'expiration_date': expiration_date,
    }


def _mock_or_response(items: list) -> MagicMock:
    """Return a mock requests.Response yielding the given items."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {'data': items}
    return mock_resp


# ---------------------------------------------------------------------------
# refresh()
# ---------------------------------------------------------------------------

class TestRefresh:
    def test_refresh_upserts_models(self, app, db):
        items = [
            _make_model_item('test/model-a', output_modalities=['text']),
            _make_model_item('test/model-b', output_modalities=['image']),
        ]
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            from app.models.openrouter_model import OpenRouterModelDoc

            with patch('requests.get', return_value=_mock_or_response(items)):
                result = ModelRegistryService().refresh()

            assert 'synced' in result
            assert result['synced'] == 2
            assert OpenRouterModelDoc.count() == 2

    def test_refresh_updates_existing_doc(self, app, db):
        """Second refresh advances last_synced_at on already-present models."""
        item = _make_model_item('test/model-x')
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            from app.models.openrouter_model import OpenRouterModelDoc

            with patch('requests.get', return_value=_mock_or_response([item])):
                ModelRegistryService().refresh()

            first_sync = OpenRouterModelDoc.get_last_sync_at()

            # Ensure some time passes so last_synced_at is different.
            # In practice the test is fast; we just need a second upsert.
            with patch('requests.get', return_value=_mock_or_response([item])):
                ModelRegistryService().refresh()

            second_sync = OpenRouterModelDoc.get_last_sync_at()

            # Both should be non-None; second >= first.
            assert first_sync is not None
            assert second_sync is not None
            assert second_sync >= first_sync

    def test_refresh_returns_error_on_network_failure(self, app, db):
        import requests as req
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService

            with patch('requests.get', side_effect=req.exceptions.ConnectionError('refused')):
                result = ModelRegistryService().refresh()

            assert 'error' in result


# ---------------------------------------------------------------------------
# get()
# ---------------------------------------------------------------------------

class TestGet:
    def _seed(self, app, model_id: str, **kwargs):
        from app.models.openrouter_model import OpenRouterModelDoc
        OpenRouterModelDoc.upsert_many([_make_model_item(model_id, **kwargs)])

    def test_get_known_id(self, app, db):
        with app.app_context():
            self._seed(app, 'known/model')
            from app.services.model_registry_service import ModelRegistryService
            doc = ModelRegistryService().get('known/model')
            assert doc is not None
            assert doc['_id'] == 'known/model'

    def test_get_unknown_id_returns_none(self, app, db):
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            doc = ModelRegistryService().get('does/not-exist')
            assert doc is None


# ---------------------------------------------------------------------------
# find_by_modality()
# ---------------------------------------------------------------------------

class TestFindByModality:
    def _seed_models(self, app):
        from app.models.openrouter_model import OpenRouterModelDoc
        OpenRouterModelDoc.upsert_many([
            _make_model_item('text/text-only', input_modalities=['text'], output_modalities=['text']),
            _make_model_item('img/image-in', input_modalities=['text', 'image'], output_modalities=['text']),
            _make_model_item('img/image-out', input_modalities=['text'], output_modalities=['image', 'text']),
        ])

    def test_find_by_input_image(self, app, db):
        with app.app_context():
            self._seed_models(app)
            from app.services.model_registry_service import ModelRegistryService
            results = ModelRegistryService().find_by_modality(input=['image'])
            ids = [d['_id'] for d in results]
            assert 'img/image-in' in ids
            assert 'text/text-only' not in ids
            assert 'img/image-out' not in ids

    def test_find_by_output_image(self, app, db):
        with app.app_context():
            self._seed_models(app)
            from app.services.model_registry_service import ModelRegistryService
            results = ModelRegistryService().find_by_modality(output=['image'])
            ids = [d['_id'] for d in results]
            assert 'img/image-out' in ids
            assert 'text/text-only' not in ids
            assert 'img/image-in' not in ids

    def test_no_filter_returns_all(self, app, db):
        with app.app_context():
            self._seed_models(app)
            from app.services.model_registry_service import ModelRegistryService
            results = ModelRegistryService().find_by_modality()
            assert len(results) == 3


# ---------------------------------------------------------------------------
# find_by_capability()
# ---------------------------------------------------------------------------

class TestFindByCapability:
    def test_filter_by_tools(self, app, db):
        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            OpenRouterModelDoc.upsert_many([
                _make_model_item('cap/with-tools', supported_parameters=['tools', 'temperature']),
                _make_model_item('cap/no-tools', supported_parameters=['temperature']),
            ])
            from app.services.model_registry_service import ModelRegistryService
            results = ModelRegistryService().find_by_capability('tools')
            ids = [d['_id'] for d in results]
            assert 'cap/with-tools' in ids
            assert 'cap/no-tools' not in ids

    def test_missing_capability_returns_empty(self, app, db):
        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            OpenRouterModelDoc.upsert_many([
                _make_model_item('cap/plain'),
            ])
            from app.services.model_registry_service import ModelRegistryService
            results = ModelRegistryService().find_by_capability('nonexistent_param')
            assert results == []


# ---------------------------------------------------------------------------
# get_pricing()
# ---------------------------------------------------------------------------

class TestGetPricing:
    def test_known_model_returns_floats(self, app, db):
        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            OpenRouterModelDoc.upsert_many([
                _make_model_item(
                    'price/model',
                    pricing={'prompt': '0.000002', 'completion': '0.000006'},
                )
            ])
            from app.services.model_registry_service import ModelRegistryService
            pricing = ModelRegistryService().get_pricing('price/model')

            assert isinstance(pricing['prompt'], float)
            assert isinstance(pricing['completion'], float)
            assert isinstance(pricing['prompt_per_million'], float)
            assert isinstance(pricing['completion_per_million'], float)
            assert isinstance(pricing['cached_per_million'], float)
            # Check per-million conversion (2e-6 * 1e6 == 2.0)
            assert abs(pricing['prompt_per_million'] - 2.0) < 1e-9
            assert abs(pricing['completion_per_million'] - 6.0) < 1e-9

    def test_unknown_model_returns_zero_dict(self, app, db):
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            pricing = ModelRegistryService().get_pricing('not/real')
            for key in ('prompt', 'completion', 'cached', 'prompt_per_million',
                        'completion_per_million', 'cached_per_million'):
                assert pricing[key] == 0.0, f'{key} should be 0.0 for unknown model'


# ---------------------------------------------------------------------------
# is_image_capable()
# ---------------------------------------------------------------------------

class TestIsImageCapable:
    def _seed(self, app, model_id: str, output_modalities: list):
        from app.models.openrouter_model import OpenRouterModelDoc
        OpenRouterModelDoc.upsert_many([
            _make_model_item(model_id, output_modalities=output_modalities)
        ])

    def test_image_output_model_is_capable(self, app, db):
        with app.app_context():
            self._seed(app, 'img/gen-model', ['image', 'text'])
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_image_capable('img/gen-model') is True

    def test_text_only_model_is_not_capable(self, app, db):
        with app.app_context():
            self._seed(app, 'txt/plain', ['text'])
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_image_capable('txt/plain') is False

    def test_unknown_model_is_not_capable(self, app, db):
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_image_capable('not/in-db') is False


# ---------------------------------------------------------------------------
# is_stale()
# ---------------------------------------------------------------------------

class TestIsStale:
    def test_empty_collection_is_stale(self, app, db):
        with app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_stale() is True

    def test_recently_synced_is_not_stale(self, app, db):
        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            # Insert a fresh doc (last_synced_at = now)
            OpenRouterModelDoc.upsert_many([_make_model_item('fresh/model')])
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_stale() is False

    def test_old_sync_is_stale(self, app, db):
        with app.app_context():
            from app.models.openrouter_model import OpenRouterModelDoc
            col = OpenRouterModelDoc.get_collection()
            # Insert a doc with last_synced_at 2 hours ago.
            old_time = datetime.utcnow() - timedelta(hours=2)
            col.insert_one({
                '_id': 'stale/model',
                'name': 'Stale Model',
                'last_synced_at': old_time,
            })
            from app.services.model_registry_service import ModelRegistryService
            assert ModelRegistryService().is_stale() is True
