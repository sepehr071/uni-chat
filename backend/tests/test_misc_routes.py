"""Tests for users, prompt_templates routes."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.llm_config import LLMConfigModel
from app.models.prompt_template import PromptTemplateModel


# ===========================================================================
# /api/users/*
# ===========================================================================

class TestUsers:
    def test_profile_get(self, client, test_user, auth_headers):
        r = client.get('/api/users/profile', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['profile']['email'] == test_user['email']

    def test_profile_update(self, client, test_user, auth_headers):
        r = client.put('/api/users/profile', json={
            'display_name': 'NewName',
            'avatar_url': 'https://x/y.png',
            'bio': 'short bio',
        }, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['profile']['display_name'] == 'NewName'

    def test_profile_invalid_name_400(self, client, test_user, auth_headers):
        r = client.put('/api/users/profile',
                       json={'display_name': '<bad>'}, headers=auth_headers)
        assert r.status_code == 400

    def test_stats(self, client, test_user, auth_headers):
        r = client.get('/api/users/stats', headers=auth_headers)
        assert r.status_code == 200
        stats = r.get_json()['stats']
        assert 'total_conversations' in stats
        assert 'tokens_used' in stats

    def test_costs(self, client, test_user, auth_headers):
        r = client.get('/api/users/costs?days=7', headers=auth_headers)
        assert r.status_code == 200
        assert 'costs' in r.get_json()

    def test_settings_get(self, client, test_user, auth_headers):
        r = client.get('/api/users/settings', headers=auth_headers)
        assert r.status_code == 200

    def test_settings_update_theme(self, client, test_user, auth_headers):
        r = client.put('/api/users/settings',
                       json={'theme': 'light'}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['settings']['theme'] == 'light'

    def test_settings_invalid_theme_kept(self, client, test_user, auth_headers):
        # Invalid theme is silently ignored — settings stay the same.
        r = client.put('/api/users/settings',
                       json={'theme': 'neon'}, headers=auth_headers)
        assert r.status_code == 200

    def test_settings_default_config_404(self, client, test_user, auth_headers):
        r = client.put('/api/users/settings',
                       json={'default_config_id': str(ObjectId())},
                       headers=auth_headers)
        assert r.status_code == 404

    def test_settings_default_config_set_then_clear(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=test_user['_id'])
        r = client.put('/api/users/settings',
                       json={'default_config_id': str(cfg['_id'])},
                       headers=auth_headers)
        assert r.status_code == 200
        r2 = client.put('/api/users/settings',
                        json={'default_config_id': None},
                        headers=auth_headers)
        assert r2.status_code == 200

    def test_settings_notifications_toggle(self, client, test_user, auth_headers):
        r = client.put('/api/users/settings',
                       json={'notifications_enabled': False},
                       headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['settings']['notifications_enabled'] is False


# ===========================================================================
# /api/prompt-templates/*
# ===========================================================================

class TestPromptTemplates:
    def test_list_empty(self, client, test_user, auth_headers):
        r = client.get('/api/prompt-templates/list', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['templates'] == []

    def test_list_with_category_filter(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            PromptTemplateModel.create('A', 'art', 'go {x}')
            PromptTemplateModel.create('B', 'code', 'do {y}')
        r = client.get('/api/prompt-templates/list?category=art',
                       headers=auth_headers)
        assert len(r.get_json()['templates']) == 1

    def test_categories(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            PromptTemplateModel.create('A', 'art', 'x')
            PromptTemplateModel.create('B', 'art', 'y')
            PromptTemplateModel.create('C', 'code', 'z')
        r = client.get('/api/prompt-templates/categories', headers=auth_headers)
        cats = {c['category'] for c in r.get_json()['categories']}
        assert cats == {'art', 'code'}

    def test_use_template_not_found(self, client, auth_headers):
        r = client.post(f'/api/prompt-templates/{ObjectId()}/use',
                        headers=auth_headers)
        assert r.status_code == 404

    def test_use_template_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            t = PromptTemplateModel.create('A', 'art', 'go {x}')
        r = client.post(f"/api/prompt-templates/{t['_id']}/use",
                        headers=auth_headers)
        assert r.status_code == 200

    def test_create_non_admin_403(self, client, test_user, auth_headers):
        r = client.post('/api/prompt-templates/create', json={
            'name': 'X', 'category': 'art', 'template_text': 't',
        }, headers=auth_headers)
        assert r.status_code == 403

    def test_create_missing_fields_400(self, client, admin_headers):
        r = client.post('/api/prompt-templates/create',
                        json={'name': 'X'}, headers=admin_headers)
        assert r.status_code == 400
        r2 = client.post('/api/prompt-templates/create',
                         json={'name': 'X', 'category': 'art'},
                         headers=admin_headers)
        assert r2.status_code == 400

    def test_create_success(self, client, admin_headers):
        r = client.post('/api/prompt-templates/create', json={
            'name': 'X', 'category': 'art', 'template_text': 'go {x}',
            'variables': ['x'], 'description': 'd',
        }, headers=admin_headers)
        assert r.status_code == 201

    def test_update_not_found(self, client, admin_headers):
        r = client.put(f'/api/prompt-templates/{ObjectId()}',
                       json={'name': 'X'}, headers=admin_headers)
        assert r.status_code == 404

    def test_update_success(self, app, db, client, admin_headers):
        with app.app_context():
            t = PromptTemplateModel.create('A', 'art', 'x')
        r = client.put(f"/api/prompt-templates/{t['_id']}", json={
            'name': 'B', 'category': 'c', 'template_text': 'y',
            'variables': ['v'], 'description': 'd', 'is_active': False,
        }, headers=admin_headers)
        assert r.status_code == 200

    def test_delete_not_found(self, client, admin_headers):
        r = client.delete(f'/api/prompt-templates/{ObjectId()}',
                          headers=admin_headers)
        assert r.status_code == 404

    def test_delete_success(self, app, db, client, admin_headers):
        with app.app_context():
            t = PromptTemplateModel.create('A', 'art', 'x')
        r = client.delete(f"/api/prompt-templates/{t['_id']}",
                          headers=admin_headers)
        assert r.status_code == 200
