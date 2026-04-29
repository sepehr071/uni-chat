"""
Tests for /api/models/catalog routes.

Admin-gated POST /refresh is tested with ADMIN_EMAIL env var set to match
the admin user's email (admin@gmail.com — same as conftest admin_user fixture).
"""

import os
import pytest
from datetime import datetime
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seed_models(db, count: int = 5) -> list:
    """Insert `count` model docs directly into openrouter_models collection."""
    models = []
    now = datetime.utcnow()
    for i in range(count):
        doc = {
            '_id': f'vendor/model-{i}',
            'name': f'Model {i}',
            'context_length': 8192,
            'pricing': {'prompt': 0.000001 * (i + 1), 'completion': 0.000002 * (i + 1)},
            'architecture': {
                'input_modalities': ['text'],
                'output_modalities': ['image'] if i % 2 == 0 else ['text'],
            },
            'supported_parameters': ['tools'] if i == 0 else [],
            'last_synced_at': now,
        }
        db['openrouter_models'].insert_one(doc)
        models.append(doc)
    return models


# ---------------------------------------------------------------------------
# GET /api/models/catalog  — list + filter + pagination
# ---------------------------------------------------------------------------

class TestListCatalog:
    def test_requires_jwt(self, client):
        r = client.get('/api/models/catalog')
        assert r.status_code == 401

    def test_returns_all_when_no_filter(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=4)

        r = client.get('/api/models/catalog', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'data' in body
        assert 'total' in body
        assert body['total'] == 4

    def test_filter_by_modality_image(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=5)

        # Docs at i=0,2,4 have output_modalities=['image']
        r = client.get('/api/models/catalog?modality=image&page_size=10', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['total'] == 3
        for doc in body['data']:
            assert 'image' in doc['architecture']['output_modalities']

    def test_pagination_page_size(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=10)

        r = client.get('/api/models/catalog?page_size=4', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        # page_size limits the returned data list
        assert len(body['data']) <= 4
        assert body['total'] == 10

    def test_page_param(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=6)

        r1 = client.get('/api/models/catalog?page=1&page_size=4', headers=auth_headers)
        r2 = client.get('/api/models/catalog?page=2&page_size=4', headers=auth_headers)

        body1 = r1.get_json()
        body2 = r2.get_json()
        # Page 1 has 4 items; page 2 has 2 remaining
        assert len(body1['data']) == 4
        assert len(body2['data']) == 2
        # No overlap in ids
        ids1 = {d['_id'] for d in body1['data']}
        ids2 = {d['_id'] for d in body2['data']}
        assert ids1.isdisjoint(ids2)

    def test_last_synced_at_is_isoformat(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=1)

        r = client.get('/api/models/catalog', headers=auth_headers)
        body = r.get_json()
        doc = body['data'][0]
        assert 'last_synced_at' in doc
        # Should be a string (ISO datetime), not a dict
        assert isinstance(doc['last_synced_at'], str)
        assert 'T' in doc['last_synced_at']

    def test_raw_field_stripped(self, app, client, db, auth_headers):
        with app.app_context():
            # Insert a doc with a 'raw' field
            db['openrouter_models'].insert_one({
                '_id': 'raw/model',
                'name': 'Raw Model',
                'raw': {'some': 'large nested data'},
                'last_synced_at': datetime.utcnow(),
                'architecture': {'input_modalities': ['text'], 'output_modalities': ['text']},
            })

        r = client.get('/api/models/catalog', headers=auth_headers)
        body = r.get_json()
        for doc in body['data']:
            assert 'raw' not in doc, "raw field should be stripped from list responses"


# ---------------------------------------------------------------------------
# GET /api/models/catalog/<model_id>  — single doc
# ---------------------------------------------------------------------------

class TestGetCatalogModel:
    def test_requires_jwt(self, client):
        r = client.get('/api/models/catalog/vendor/model-0')
        assert r.status_code == 401

    def test_known_model_returns_200(self, app, client, db, auth_headers):
        with app.app_context():
            db['openrouter_models'].insert_one({
                '_id': 'openai/gpt-test',
                'name': 'GPT Test',
                'last_synced_at': datetime.utcnow(),
                'architecture': {'input_modalities': ['text'], 'output_modalities': ['text']},
            })

        # The route uses <path:model_id> so slashes pass through.
        # Endpoint lazy-fetches endpoints — mock get_endpoints to avoid real HTTP.
        with patch('app.services.model_registry_service.ModelRegistryService.get_endpoints', return_value=None):
            r = client.get('/api/models/catalog/openai/gpt-test', headers=auth_headers)

        assert r.status_code == 200
        body = r.get_json()
        assert body['_id'] == 'openai/gpt-test'
        assert body['name'] == 'GPT Test'
        assert 'endpoints' in body

    def test_unknown_model_returns_404(self, app, client, db, auth_headers):
        with patch('app.services.model_registry_service.ModelRegistryService.get_endpoints', return_value=None):
            r = client.get('/api/models/catalog/does/not-exist', headers=auth_headers)
        assert r.status_code == 404

    def test_last_synced_at_serialized(self, app, client, db, auth_headers):
        with app.app_context():
            db['openrouter_models'].insert_one({
                '_id': 'ts/model',
                'name': 'TS Model',
                'last_synced_at': datetime.utcnow(),
                'architecture': {'input_modalities': ['text'], 'output_modalities': ['text']},
            })

        with patch('app.services.model_registry_service.ModelRegistryService.get_endpoints', return_value=None):
            r = client.get('/api/models/catalog/ts/model', headers=auth_headers)

        body = r.get_json()
        assert isinstance(body['last_synced_at'], str)


# ---------------------------------------------------------------------------
# GET /api/models/catalog/refresh-status
# ---------------------------------------------------------------------------

class TestRefreshStatus:
    def test_requires_jwt(self, client):
        r = client.get('/api/models/catalog/refresh-status')
        assert r.status_code == 401

    def test_returns_expected_shape_empty(self, app, client, db, auth_headers):
        r = client.get('/api/models/catalog/refresh-status', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'last_synced_at' in body
        assert 'count' in body
        assert 'is_stale' in body
        assert 'has_models' in body
        # Empty db
        assert body['count'] == 0
        assert body['has_models'] is False
        assert body['is_stale'] is True
        assert body['last_synced_at'] is None

    def test_returns_expected_shape_with_data(self, app, client, db, auth_headers):
        with app.app_context():
            _seed_models(db, count=3)

        r = client.get('/api/models/catalog/refresh-status', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['count'] == 3
        assert body['has_models'] is True
        assert isinstance(body['last_synced_at'], str)
        # Fresh seeds — should not be stale.
        assert body['is_stale'] is False


# ---------------------------------------------------------------------------
# POST /api/models/catalog/refresh  — admin only
# ---------------------------------------------------------------------------

class TestRefreshCatalog:
    """
    admin_required checks os.environ['ADMIN_EMAIL'] against the calling user's
    email.  We use monkeypatch to set ADMIN_EMAIL=admin@gmail.com to match the
    conftest admin_user fixture.
    """

    def test_non_admin_gets_403(self, client, auth_headers):
        r = client.post('/api/models/catalog/refresh', headers=auth_headers)
        assert r.status_code == 403

    def test_unauthenticated_gets_401(self, client):
        r = client.post('/api/models/catalog/refresh')
        assert r.status_code == 401

    def test_admin_triggers_refresh(self, app, client, db, admin_user, admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        mock_result = {'synced': 7, 'at': '2026-01-01T00:00:00'}
        with patch('app.services.model_registry_service.ModelRegistryService.refresh',
                   return_value=mock_result) as mock_refresh:
            r = client.post('/api/models/catalog/refresh', headers=admin_headers)

        assert r.status_code == 200
        body = r.get_json()
        assert body['synced'] == 7
        mock_refresh.assert_called_once()

    def test_admin_refresh_propagates_error(self, app, client, db, admin_user, admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        with patch('app.services.model_registry_service.ModelRegistryService.refresh',
                   return_value={'error': 'network timeout'}):
            r = client.post('/api/models/catalog/refresh', headers=admin_headers)

        assert r.status_code == 502
