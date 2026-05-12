"""Tests for app/routes/admin.py — super-admin (CEO) endpoints."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.conversation import ConversationModel
from app.models.llm_config import LLMConfigModel
from app.models.message import MessageModel
from app.models.user import UserModel


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestGuard:
    def test_non_admin_403(self, client, auth_headers):
        r = client.get('/api/admin/users', headers=auth_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class TestUsers:
    def test_list_users(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            UserModel.create(email='u1@gmail.com', password='Pw123!@#',
                             display_name='U1', role='user')
        r = client.get('/api/admin/users', headers=admin_headers)
        assert r.status_code == 200
        emails = {u['email'] for u in r.get_json()['users']}
        assert 'u1@gmail.com' in emails
        assert 'admin@gmail.com' in emails

    def test_list_users_search(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            UserModel.create(email='alice@gmail.com', password='Pw123!@#',
                             display_name='Alice')
            UserModel.create(email='bob@gmail.com', password='Pw123!@#',
                             display_name='Bob')
        r = client.get('/api/admin/users?search=alice', headers=admin_headers)
        emails = {u['email'] for u in r.get_json()['users']}
        assert 'alice@gmail.com' in emails
        assert 'bob@gmail.com' not in emails

    def test_list_users_role_filter(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            UserModel.create(email='m@gmail.com', password='Pw123!@#',
                             display_name='M', role='manager')
        r = client.get('/api/admin/users?role=manager', headers=admin_headers)
        roles = {u['role'] for u in r.get_json()['users']}
        assert roles == {'manager'}

    def test_list_users_exclude_banned(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='x@gmail.com', password='Pw123!@#',
                                 display_name='X')
            UserModel.ban_user(u['_id'], 'spam', str(admin_user['_id']))
        r = client.get('/api/admin/users?include_banned=false',
                       headers=admin_headers)
        emails = {u['email'] for u in r.get_json()['users']}
        assert 'x@gmail.com' not in emails

    def test_get_user_not_found(self, client, admin_headers):
        r = client.get(f'/api/admin/users/{ObjectId()}', headers=admin_headers)
        assert r.status_code == 404

    def test_get_user_with_stats(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='stats@gmail.com', password='Pw123!@#',
                                 display_name='Stats')
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=u['_id'])
            ConversationModel.create(u['_id'], str(cfg['_id']))
        r = client.get(f"/api/admin/users/{u['_id']}", headers=admin_headers)
        assert r.status_code == 200
        body = r.get_json()['user']
        assert body['stats']['conversation_count'] == 1
        assert body['stats']['config_count'] == 1
        assert 'password_hash' not in body


class TestPatchUser:
    def test_user_not_found(self, client, admin_headers):
        r = client.patch(f'/api/admin/users/{ObjectId()}',
                         json={'role': 'manager'}, headers=admin_headers)
        assert r.status_code == 404

    def test_invalid_role_400(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
        r = client.patch(f"/api/admin/users/{u['_id']}",
                         json={'role': 'wizard'}, headers=admin_headers)
        assert r.status_code == 400

    def test_no_fields_400(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
        r = client.patch(f"/api/admin/users/{u['_id']}",
                         json={'frob': 'x'}, headers=admin_headers)
        assert r.status_code == 400

    def test_promote_to_manager(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
        r = client.patch(f"/api/admin/users/{u['_id']}",
                         json={'role': 'manager'}, headers=admin_headers)
        assert r.status_code == 200
        assert r.get_json()['user']['role'] == 'manager'


class TestBanUnban:
    def test_ban_self_400(self, app, db, client, admin_user, admin_headers):
        r = client.put(f"/api/admin/users/{admin_user['_id']}/ban",
                       json={'reason': 'r'}, headers=admin_headers)
        assert r.status_code == 400

    def test_ban_admin_400(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            other_admin = UserModel.create(email='admin2@gmail.com',
                                           password='Pw123!@#',
                                           display_name='A2', role='admin')
        r = client.put(f"/api/admin/users/{other_admin['_id']}/ban",
                       json={'reason': 'r'}, headers=admin_headers)
        assert r.status_code == 400

    def test_ban_not_found(self, client, admin_headers):
        r = client.put(f'/api/admin/users/{ObjectId()}/ban',
                       json={'reason': 'r'}, headers=admin_headers)
        assert r.status_code == 404

    def test_ban_success(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
        r = client.put(f"/api/admin/users/{u['_id']}/ban",
                       json={'reason': 'spam'}, headers=admin_headers)
        assert r.status_code == 200

    def test_unban_not_found(self, client, admin_headers):
        r = client.put(f'/api/admin/users/{ObjectId()}/unban',
                       headers=admin_headers)
        assert r.status_code == 404

    def test_unban_success(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
            UserModel.ban_user(u['_id'], 'r', str(admin_user['_id']))
        r = client.put(f"/api/admin/users/{u['_id']}/unban",
                       headers=admin_headers)
        assert r.status_code == 200


class TestLimits:
    def test_user_not_found(self, client, admin_headers):
        r = client.put(f'/api/admin/users/{ObjectId()}/limits',
                       json={'tokens_limit': 1000}, headers=admin_headers)
        assert r.status_code == 404

    def test_set_limit(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
        r = client.put(f"/api/admin/users/{u['_id']}/limits",
                       json={'tokens_limit': 5000}, headers=admin_headers)
        assert r.status_code == 200


class TestHistory:
    def test_user_not_found(self, client, admin_headers):
        r = client.get(f'/api/admin/users/{ObjectId()}/history',
                       headers=admin_headers)
        assert r.status_code == 404

    def test_returns_conversations(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            u = UserModel.create(email='u@gmail.com', password='Pw123!@#',
                                 display_name='U')
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=u['_id'])
            ConversationModel.create(u['_id'], str(cfg['_id']))
        r = client.get(f"/api/admin/users/{u['_id']}/history?include_messages=true",
                       headers=admin_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

class TestTemplates:
    def test_list_empty(self, client, admin_headers):
        r = client.get('/api/admin/templates', headers=admin_headers)
        assert r.status_code == 200
        assert r.get_json()['templates'] == []

    def test_create_template_missing_fields(self, client, admin_headers):
        r = client.post('/api/admin/templates', json={'name': 'X'},
                        headers=admin_headers)
        assert r.status_code == 400

    def test_create_template_ok(self, client, admin_headers):
        r = client.post('/api/admin/templates', json={
            'name': 'T', 'model_id': 'm',
        }, headers=admin_headers)
        assert r.status_code == 201

    def test_update_template_not_found(self, app, db, client, admin_headers):
        r = client.put(f'/api/admin/templates/{ObjectId()}',
                       json={'name': 'X'}, headers=admin_headers)
        assert r.status_code == 404

    def test_update_non_template_404(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            cfg = LLMConfigModel.create(name='C', model_id='m', model_name='m',
                                        owner_id=admin_user['_id'], visibility='private')
        r = client.put(f"/api/admin/templates/{cfg['_id']}",
                       json={'name': 'X'}, headers=admin_headers)
        assert r.status_code == 404

    def test_update_template_success(self, app, db, client, admin_headers):
        with app.app_context():
            tpl = LLMConfigModel.create(name='T', model_id='m', model_name='m',
                                         owner_id=None, visibility='template')
        r = client.put(f"/api/admin/templates/{tpl['_id']}",
                       json={'name': 'NewT'}, headers=admin_headers)
        assert r.status_code == 200
        assert r.get_json()['template']['name'] == 'NewT'

    def test_delete_template_not_found(self, client, admin_headers):
        r = client.delete(f'/api/admin/templates/{ObjectId()}',
                          headers=admin_headers)
        assert r.status_code == 404

    def test_delete_template_success(self, app, db, client, admin_headers):
        with app.app_context():
            tpl = LLMConfigModel.create(name='T', model_id='m', model_name='m',
                                         owner_id=None, visibility='template')
        r = client.delete(f"/api/admin/templates/{tpl['_id']}",
                          headers=admin_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class TestAnalytics:
    def test_basic_analytics_smoke(self, client, admin_headers):
        r = client.get('/api/admin/analytics', headers=admin_headers)
        assert r.status_code == 200
        data = r.get_json()['analytics']
        for key in ('users', 'conversations', 'messages', 'tokens',
                    'model_usage', 'period_days'):
            assert key in data

    def test_costs_analytics_smoke(self, client, admin_headers):
        r = client.get('/api/admin/analytics/costs', headers=admin_headers)
        assert r.status_code == 200
        assert 'costs' in r.get_json()

    def test_timeseries_smoke(self, client, admin_headers):
        r = client.get('/api/admin/analytics/timeseries?days=5', headers=admin_headers)
        assert r.status_code == 200
        ts = r.get_json()['timeseries']
        assert len(ts['messages']) == 5
        assert len(ts['users']) == 5


# ---------------------------------------------------------------------------
# Audit logs
# ---------------------------------------------------------------------------

class TestAuditLogs:
    def test_list_empty(self, client, admin_headers):
        r = client.get('/api/admin/audit-logs', headers=admin_headers)
        assert r.status_code == 200
        assert r.get_json()['logs'] == []

    def test_action_filter(self, app, db, client, admin_user, admin_headers):
        with app.app_context():
            from app.models.audit_log import AuditLogModel
            AuditLogModel.create('test_action', admin_user['_id'])
        r = client.get('/api/admin/audit-logs?action=test_action',
                       headers=admin_headers)
        assert r.status_code == 200
        logs = r.get_json()['logs']
        assert all(l['action'] == 'test_action' for l in logs)


# ---------------------------------------------------------------------------
# Holding view endpoints
# ---------------------------------------------------------------------------

class TestHolding:
    def test_list_companies(self, client, admin_headers):
        r = client.get('/api/admin/companies', headers=admin_headers)
        assert r.status_code == 200

    def test_get_company_invalid_id_400(self, client, admin_headers):
        r = client.get('/api/admin/companies/bad', headers=admin_headers)
        assert r.status_code == 400

    def test_get_company_not_found_404(self, client, admin_headers):
        r = client.get(f'/api/admin/companies/{ObjectId()}', headers=admin_headers)
        assert r.status_code == 404

    def test_users_overview_invalid_role_400(self, client, admin_headers):
        r = client.get('/api/admin/users-overview?role=wizard',
                       headers=admin_headers)
        assert r.status_code == 400

    def test_users_overview(self, client, admin_headers):
        r = client.get('/api/admin/users-overview', headers=admin_headers)
        assert r.status_code == 200
