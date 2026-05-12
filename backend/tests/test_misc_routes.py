"""Tests for canvas, gallery, users, prompt_templates routes."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.llm_config import LLMConfigModel
from app.models.prompt_template import PromptTemplateModel
from app.models.shared_canvas import SharedCanvasModel
from app.models.user import UserModel


# ===========================================================================
# /api/canvas/*
# ===========================================================================

class TestCanvas:
    def test_share_no_body_400(self, client, test_user, auth_headers):
        r = client.post('/api/canvas/share',
                        data='', content_type='application/json',
                        headers=auth_headers)
        assert r.status_code == 400

    def test_share_creates_canvas(self, client, test_user, auth_headers):
        r = client.post('/api/canvas/share', json={
            'title': 'My Canvas', 'html': '<h1>Hi</h1>',
            'css': 'body{}', 'js': 'console.log(1)',
        }, headers=auth_headers)
        assert r.status_code == 201
        body = r.get_json()
        assert body['canvas']['title'] == 'My Canvas'
        assert body['share_url'].startswith('/canvas/')

    def test_my_canvases_empty(self, client, test_user, auth_headers):
        r = client.get('/api/canvas/my-canvases', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['canvases'] == []

    def test_my_canvases_populated(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            SharedCanvasModel.create(str(test_user['_id']), 'X', '<p>x</p>', '', '')
        r = client.get('/api/canvas/my-canvases', headers=auth_headers)
        assert r.get_json()['total'] == 1

    def test_update_no_body(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(test_user['_id']), 'X', '<p>x</p>', '', '')
        r = client.patch(f"/api/canvas/{c['share_id']}",
                         data='', content_type='application/json',
                         headers=auth_headers)
        assert r.status_code == 400

    def test_update_no_valid_fields(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(test_user['_id']), 'X', '<p>x</p>', '', '')
        r = client.patch(f"/api/canvas/{c['share_id']}",
                         json={'mystery': 1}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_not_found(self, client, auth_headers):
        r = client.patch('/api/canvas/nope',
                         json={'title': 'New'}, headers=auth_headers)
        assert r.status_code == 404

    def test_update_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(test_user['_id']), 'X', '<p>x</p>', '', '')
        r = client.patch(f"/api/canvas/{c['share_id']}",
                         json={'title': 'New'}, headers=auth_headers)
        assert r.status_code == 200

    def test_delete_not_found(self, client, auth_headers):
        r = client.delete('/api/canvas/nope', headers=auth_headers)
        assert r.status_code == 404

    def test_delete_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(test_user['_id']), 'X', '<p>x</p>', '', '')
        r = client.delete(f"/api/canvas/{c['share_id']}", headers=auth_headers)
        assert r.status_code == 200

    def test_public_canvas_not_found(self, client):
        r = client.get('/api/canvas/public/nope')
        assert r.status_code == 404

    def test_public_private_canvas_404(self, app, db, client):
        with app.app_context():
            c = SharedCanvasModel.create(str(ObjectId()), 'X', '<p>x</p>',
                                          '', '', visibility='private')
        r = client.get(f"/api/canvas/public/{c['share_id']}")
        assert r.status_code == 404

    def test_public_canvas_success(self, app, db, client):
        with app.app_context():
            c = SharedCanvasModel.create(str(ObjectId()), 'X', '<p>x</p>', '', '')
        r = client.get(f"/api/canvas/public/{c['share_id']}")
        assert r.status_code == 200
        body = r.get_json()['canvas']
        assert 'owner_id' not in body

    def test_fork_not_found(self, client, auth_headers):
        r = client.post('/api/canvas/public/nope/fork', headers=auth_headers)
        assert r.status_code == 404

    def test_fork_private_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(ObjectId()), 'X', '<p>x</p>',
                                          '', '', visibility='private')
        r = client.post(f"/api/canvas/public/{c['share_id']}/fork",
                        headers=auth_headers)
        assert r.status_code == 404

    def test_fork_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = SharedCanvasModel.create(str(ObjectId()), 'Orig', '<p>x</p>', '', '')
        r = client.post(f"/api/canvas/public/{c['share_id']}/fork",
                        headers=auth_headers)
        assert r.status_code == 201
        assert '(fork)' in r.get_json()['canvas']['title']


# ===========================================================================
# /api/gallery/*
# ===========================================================================

class TestGallery:
    def test_browse_empty(self, client, test_user, auth_headers):
        r = client.get('/api/gallery', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 0

    def test_browse_with_results(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            LLMConfigModel.create(name='Public', model_id='m', model_name='m',
                                  owner_id=ObjectId(), visibility='public',
                                  tags=['t1'])
        r = client.get('/api/gallery?tags=t1&model=m&sort=uses_count',
                       headers=auth_headers)
        assert r.get_json()['total'] == 1

    def test_templates_route(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            LLMConfigModel.create(name='Tpl', model_id='m', model_name='m',
                                  owner_id=None, visibility='template')
        r = client.get('/api/gallery/templates', headers=auth_headers)
        assert r.status_code == 200
        assert len(r.get_json()['templates']) == 1

    def test_get_public_config_not_found(self, client, auth_headers):
        r = client.get(f'/api/gallery/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_get_public_config_private_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=ObjectId(), visibility='private')
        r = client.get(f"/api/gallery/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_public_config_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=ObjectId(), visibility='public')
        r = client.get(f"/api/gallery/{cfg['_id']}", headers=auth_headers)
        assert r.status_code == 200

    def test_save_404(self, client, auth_headers):
        r = client.post(f'/api/gallery/{ObjectId()}/save', headers=auth_headers)
        assert r.status_code == 404

    def test_save_then_unsave(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=ObjectId(), visibility='public')
        r = client.post(f"/api/gallery/{cfg['_id']}/save", headers=auth_headers)
        assert r.status_code == 200
        r2 = client.post(f"/api/gallery/{cfg['_id']}/unsave", headers=auth_headers)
        assert r2.status_code == 200

    def test_use_config_404(self, client, auth_headers):
        r = client.post(f'/api/gallery/{ObjectId()}/use', headers=auth_headers)
        assert r.status_code == 404

    def test_use_config_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=ObjectId(), visibility='public')
        r = client.post(f"/api/gallery/{cfg['_id']}/use", headers=auth_headers)
        assert r.status_code == 200

    def test_saved_empty(self, client, test_user, auth_headers):
        r = client.get('/api/gallery/saved', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['configs'] == []

    def test_saved_returns_ids(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=ObjectId(), visibility='public')
            UserModel.add_saved_config(str(test_user['_id']), str(cfg['_id']))
        r = client.get('/api/gallery/saved', headers=auth_headers)
        assert len(r.get_json()['configs']) == 1


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
