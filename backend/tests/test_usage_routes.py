"""
Tests for /api/usage/me and /api/admin/usage routes.

Seeds usage_logs directly and verifies aggregation, date filtering,
user isolation, and admin-only enforcement.
"""

import os
import pytest
from datetime import datetime, timedelta
from bson import ObjectId


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _insert_log(db, user_id, feature: str, model_id: str, cost: float,
                prompt_tokens: int = 100, completion_tokens: int = 50,
                created_at: datetime | None = None):
    """Insert one usage_logs document."""
    if created_at is None:
        created_at = datetime.utcnow()
    doc = {
        'user_id': ObjectId(user_id) if isinstance(user_id, str) else user_id,
        'conversation_id': ObjectId(),
        'model_id': model_id,
        'prompt_tokens': prompt_tokens,
        'completion_tokens': completion_tokens,
        'cached_tokens': 0,
        'tokens': {
            'prompt': prompt_tokens,
            'completion': completion_tokens,
            'total': prompt_tokens + completion_tokens,
        },
        'cost_usd': cost,
        'feature': feature,
        'created_at': created_at,
    }
    db['usage_logs'].insert_one(doc)


# ---------------------------------------------------------------------------
# GET /api/usage/me  (usage_bp route registered at /api prefix)
# ---------------------------------------------------------------------------

class TestGetMyUsage:
    def test_requires_jwt(self, client):
        r = client.get('/api/usage/me')
        assert r.status_code == 401

    def test_returns_only_own_rows(self, app, client, db, test_user, admin_user, auth_headers):
        uid = str(test_user['_id'])
        other_uid = str(admin_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.01)
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.02)
            _insert_log(db, other_uid, 'chat', 'openai/gpt-test', 0.99)  # other user

        r = client.get('/api/usage/me?group_by=feature', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        # Only the test user's rows are returned
        assert abs(body['total_cost'] - 0.03) < 1e-9

    def test_group_by_feature_aggregates_correctly(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.01)
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.02)
            _insert_log(db, uid, 'arena', 'anthropic/claude', 0.05)

        r = client.get('/api/usage/me?group_by=feature', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        rows = {row['key']: row for row in body['data']}
        assert 'chat' in rows
        assert 'arena' in rows
        assert abs(rows['chat']['total_cost'] - 0.03) < 1e-9
        assert abs(rows['arena']['total_cost'] - 0.05) < 1e-9
        assert rows['chat']['count'] == 2
        assert rows['arena']['count'] == 1

    def test_group_by_model(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-a', 0.01)
            _insert_log(db, uid, 'chat', 'openai/gpt-b', 0.02)

        r = client.get('/api/usage/me?group_by=model', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        model_keys = {row['key'] for row in body['data']}
        assert 'openai/gpt-a' in model_keys
        assert 'openai/gpt-b' in model_keys

    def test_total_tokens_summed(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.01,
                        prompt_tokens=100, completion_tokens=50)
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.02,
                        prompt_tokens=200, completion_tokens=100)

        r = client.get('/api/usage/me?group_by=feature', headers=auth_headers)
        body = r.get_json()
        # total_tokens is summed across data rows
        assert body['total_tokens'] == (100 + 50 + 200 + 100)

    def test_from_date_filter(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])
        now = datetime.utcnow()

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.10,
                        created_at=now - timedelta(days=10))
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.05,
                        created_at=now - timedelta(days=2))

        from_ = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        r = client.get(f'/api/usage/me?from={from_}', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        # Only the 2-days-ago entry should be included
        assert abs(body['total_cost'] - 0.05) < 1e-9

    def test_to_date_filter(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])
        now = datetime.utcnow()

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.10,
                        created_at=now - timedelta(days=10))
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.05,
                        created_at=now - timedelta(days=2))

        to = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        r = client.get(f'/api/usage/me?to={to}', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        # Only the 10-days-ago entry should be included
        assert abs(body['total_cost'] - 0.10) < 1e-9

    def test_from_to_date_window(self, app, client, db, test_user, auth_headers):
        uid = str(test_user['_id'])
        now = datetime.utcnow()

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 1.00,
                        created_at=now - timedelta(days=30))  # outside window
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.05,
                        created_at=now - timedelta(days=3))   # inside window
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 2.00,
                        created_at=now + timedelta(days=1))   # future, outside

        from_ = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        to = now.strftime('%Y-%m-%dT%H:%M:%S')
        r = client.get(f'/api/usage/me?from={from_}&to={to}', headers=auth_headers)
        body = r.get_json()
        assert abs(body['total_cost'] - 0.05) < 1e-9

    def test_empty_response_shape(self, app, client, db, test_user, auth_headers):
        r = client.get('/api/usage/me', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'data' in body
        assert 'total_cost' in body
        assert 'total_tokens' in body
        assert body['total_cost'] == 0
        assert body['total_tokens'] == 0


# ---------------------------------------------------------------------------
# GET /api/admin/usage
# ---------------------------------------------------------------------------

class TestAdminUsage:
    def test_non_admin_gets_403(self, client, auth_headers):
        r = client.get('/api/admin/usage', headers=auth_headers)
        assert r.status_code == 403

    def test_unauthenticated_gets_401(self, client):
        r = client.get('/api/admin/usage')
        assert r.status_code == 401

    def test_admin_sees_all_users(self, app, client, db, test_user, admin_user,
                                  admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        uid = str(test_user['_id'])
        admin_uid = str(admin_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.10)
            _insert_log(db, admin_uid, 'arena', 'anthropic/claude', 0.20)

        r = client.get('/api/admin/usage', headers=admin_headers)
        assert r.status_code == 200
        body = r.get_json()
        # Should sum across all users
        assert abs(body['total_cost'] - 0.30) < 1e-9

    def test_admin_response_has_required_keys(self, app, client, db, admin_user,
                                               admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        r = client.get('/api/admin/usage', headers=admin_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'data' in body
        assert 'total_cost' in body
        assert 'total_tokens' in body

    def test_admin_group_by_feature(self, app, client, db, test_user, admin_user,
                                     admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        uid = str(test_user['_id'])
        admin_uid = str(admin_user['_id'])

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.10)
            _insert_log(db, admin_uid, 'chat', 'openai/gpt-test', 0.05)
            _insert_log(db, uid, 'arena', 'anthropic/claude', 0.20)

        r = client.get('/api/admin/usage?group_by=feature', headers=admin_headers)
        assert r.status_code == 200
        body = r.get_json()
        rows = {row['key']: row for row in body['data']}
        assert 'chat' in rows
        assert 'arena' in rows
        # chat total should include both users
        assert abs(rows['chat']['total_cost'] - 0.15) < 1e-9
        assert rows['chat']['count'] == 2

    def test_admin_date_filter(self, app, client, db, test_user, admin_headers, monkeypatch):
        monkeypatch.setenv('ADMIN_EMAIL', 'admin@gmail.com')

        uid = str(test_user['_id'])
        now = datetime.utcnow()

        with app.app_context():
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 1.00,
                        created_at=now - timedelta(days=20))
            _insert_log(db, uid, 'chat', 'openai/gpt-test', 0.05,
                        created_at=now - timedelta(days=2))

        from_ = (now - timedelta(days=5)).strftime('%Y-%m-%d')
        r = client.get(f'/api/admin/usage?from={from_}', headers=admin_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert abs(body['total_cost'] - 0.05) < 1e-9
