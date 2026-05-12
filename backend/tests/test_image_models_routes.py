"""Tests for app/routes/image_generation.py + app/routes/models.py.

OpenRouter calls are mocked; coverage focus is on the route handlers and
their validation paths.
"""

from unittest.mock import patch

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.generated_image import GeneratedImageModel


# ---------------------------------------------------------------------------
# /api/image-gen/*
# ---------------------------------------------------------------------------

class TestImageGenModels:
    def test_returns_image_capable_list(self, client, test_user, auth_headers):
        fake = [{'id': 'google/gemini-2.5-flash-image', 'name': 'Gemini 2.5 Flash Image'}]
        with patch('app.routes.image_generation.OpenRouterService.get_image_capable_models',
                   return_value=fake):
            r = client.get('/api/image-gen/models', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['models'] == fake


class TestGenerate:
    def test_missing_prompt_400(self, client, auth_headers):
        r = client.post('/api/image-gen/generate',
                        json={'model': 'm'}, headers=auth_headers)
        assert r.status_code == 400

    def test_missing_model_400(self, client, auth_headers):
        r = client.post('/api/image-gen/generate',
                        json={'prompt': 'x'}, headers=auth_headers)
        assert r.status_code == 400

    def test_input_images_not_list_400(self, client, auth_headers):
        r = client.post('/api/image-gen/generate', json={
            'prompt': 'p', 'model': 'm', 'input_images': 'not-list',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_image_format_400(self, client, auth_headers):
        r = client.post('/api/image-gen/generate', json={
            'prompt': 'p', 'model': 'google/gemini-2.5-flash-image',
            'input_images': ['notavalidformat'],
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_too_many_input_images_400(self, app, db, client, auth_headers):
        # Use a known model with a small image limit, or patch the limits.
        with patch.dict(
            'app.services.openrouter_service.OpenRouterService.IMAGE_GENERATION_LIMITS',
            {'limited-model': 1}, clear=False,
        ):
            r = client.post('/api/image-gen/generate', json={
                'prompt': 'p', 'model': 'limited-model',
                'input_images': ['https://x/a.png', 'https://x/b.png'],
            }, headers=auth_headers)
        assert r.status_code == 400

    def test_generation_failure_500(self, client, auth_headers):
        with patch('app.routes.image_generation.OpenRouterService.generate_image',
                   return_value={'success': False, 'error': 'boom'}):
            r = client.post('/api/image-gen/generate',
                            json={'prompt': 'p', 'model': 'm'}, headers=auth_headers)
        assert r.status_code == 500

    def test_generation_success(self, client, test_user, auth_headers):
        fake = {'success': True, 'image_data': 'data:image/png;base64,XXX',
                'usage': {'cost_usd': 0.01}}
        with patch('app.routes.image_generation.OpenRouterService.generate_image',
                   return_value=fake):
            r = client.post('/api/image-gen/generate', json={
                'prompt': 'a horse', 'model': 'm',
            }, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['image_data'] == 'data:image/png;base64,XXX'
        assert body['image']['prompt'] == 'a horse'


class TestHistory:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/image-gen/history', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 0

    def test_populated_with_pagination(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            for _ in range(3):
                GeneratedImageModel.create(str(test_user['_id']), 'p', 'm',
                                            'data:image/png;base64,X')
        r = client.get('/api/image-gen/history?page=1&limit=2', headers=auth_headers)
        body = r.get_json()
        assert body['total'] == 3
        assert len(body['images']) == 2

    def test_favorites_filter(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(test_user['_id']), 'p', 'm',
                                              'data:image/png;base64,X')
            GeneratedImageModel.toggle_favorite(img['_id'])
        r = client.get('/api/image-gen/history?favorites=true', headers=auth_headers)
        assert r.get_json()['total'] == 1


class TestDelete:
    def test_not_found(self, client, auth_headers):
        r = client.delete(f'/api/image-gen/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(ObjectId()), 'p', 'm',
                                              'data:image/png;base64,X')
        r = client.delete(f"/api/image-gen/{img['_id']}", headers=auth_headers)
        assert r.status_code == 403

    def test_owner_delete(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(test_user['_id']), 'p', 'm',
                                              'data:image/png;base64,X')
        r = client.delete(f"/api/image-gen/{img['_id']}", headers=auth_headers)
        assert r.status_code == 200


class TestBulkDelete:
    def test_no_ids_400(self, client, auth_headers):
        r = client.post('/api/image-gen/bulk-delete', json={'image_ids': []},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_too_many_400(self, client, auth_headers):
        ids = [str(ObjectId()) for _ in range(51)]
        r = client.post('/api/image-gen/bulk-delete',
                        json={'image_ids': ids}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_id_400(self, client, auth_headers):
        r = client.post('/api/image-gen/bulk-delete',
                        json={'image_ids': ['not-an-oid']},
                        headers=auth_headers)
        assert r.status_code == 400

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(test_user['_id']), 'p', 'm',
                                              'data:image/png;base64,X')
        r = client.post('/api/image-gen/bulk-delete',
                        json={'image_ids': [str(img['_id'])]}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['deleted_count'] == 1


class TestFavorite:
    def test_not_found(self, client, auth_headers):
        r = client.post(f'/api/image-gen/{ObjectId()}/favorite', headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_403(self, app, db, client, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(ObjectId()), 'p', 'm',
                                              'data:image/png;base64,X')
        r = client.post(f"/api/image-gen/{img['_id']}/favorite", headers=auth_headers)
        assert r.status_code == 403

    def test_toggle(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            img = GeneratedImageModel.create(str(test_user['_id']), 'p', 'm',
                                              'data:image/png;base64,X')
        r = client.post(f"/api/image-gen/{img['_id']}/favorite", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'is_favorite' in body


# ---------------------------------------------------------------------------
# /api/models/*
# ---------------------------------------------------------------------------

_FAKE_MODELS = [
    {'id': 'openai/gpt-4', 'name': 'GPT-4', 'description': 'X',
     'context_length': 8000, 'pricing': {'prompt': '0.03', 'completion': '0.06'},
     'top_provider': {'context_length': 8000},
     'architecture': {'modality': 'text'}},
    {'id': 'anthropic/claude-3', 'name': 'Claude 3', 'description': '',
     'context_length': 200000, 'pricing': {},
     'top_provider': {}, 'architecture': {}},
]


@pytest.fixture(autouse=True)
def _reset_models_cache():
    """Clear the module-level cache so each test is independent."""
    from app.routes import models as models_route
    models_route._models_cache['data'] = None
    models_route._models_cache['timestamp'] = 0
    yield
    models_route._models_cache['data'] = None
    models_route._models_cache['timestamp'] = 0


class TestModelsRoute:
    def test_list_models(self, client, test_user, auth_headers):
        with patch('app.routes.models.OpenRouterService.get_available_models',
                   return_value=_FAKE_MODELS):
            r = client.get('/api/models', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['count'] == 2
        # Sorted by name
        assert body['models'][0]['name'] == 'Claude 3'

    def test_get_model_by_path_id(self, client, test_user, auth_headers):
        with patch('app.routes.models.OpenRouterService.get_available_models',
                   return_value=_FAKE_MODELS):
            r = client.get('/api/models/openai/gpt-4', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['model']['id'] == 'openai/gpt-4'

    def test_get_model_not_found(self, client, test_user, auth_headers):
        with patch('app.routes.models.OpenRouterService.get_available_models',
                   return_value=_FAKE_MODELS):
            r = client.get('/api/models/missing/model', headers=auth_headers)
        assert r.status_code == 404

    def test_refresh_clears_cache(self, client, test_user, auth_headers):
        with patch('app.routes.models.OpenRouterService.get_available_models',
                   return_value=_FAKE_MODELS):
            r = client.post('/api/models/refresh', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['count'] == 2

    def test_categories_groups_by_provider(self, client, test_user, auth_headers):
        with patch('app.routes.models.OpenRouterService.get_available_models',
                   return_value=_FAKE_MODELS):
            r = client.get('/api/models/categories', headers=auth_headers)
        assert r.status_code == 200
        cats = r.get_json()['categories']
        assert 'openai' in cats and 'anthropic' in cats
