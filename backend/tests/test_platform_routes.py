"""Tests for `/api/platform/*` routes + the `platform_admin_required` guard.

Covers: /me, /features GET+PUT, /audit, /holding/overview, /companies,
/companies/<wid>, /users-overview, /companies/<wid>/credits, /holding/credits,
/holding/ledger. Drives the routes through the Flask test client with a
hand-minted JWT carrying `is_platform_admin=True`.
"""

import pytest
from bson import ObjectId
from flask_jwt_extended import create_access_token

from app.extensions import mongo


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def seed_features_true(app, db):
    """Seed every platform feature flag to True so toggle tests have a real value to flip.

    The route only writes an audit row when at least one flag actually changes
    state — `DEFAULT_FEATURES` ships several flags as False, so without this
    seed the `{feature: 'arena', enabled: False}` toggle is a no-op and the
    audit log stays empty.
    """
    from app.models.platform_settings import (
        DEFAULT_FEATURES,
        PlatformSettingsModel,
        SINGLETON_ID,
    )
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {
                '$set': {f'features.{k}': True for k in DEFAULT_FEATURES.keys()},
                '$setOnInsert': {'_id': SINGLETON_ID},
            },
            upsert=True,
        )


@pytest.fixture
def platform_admin(app, db):
    """Insert a platform admin row and return the raw doc."""
    from app.models.platform_admin import PlatformAdminModel
    with app.app_context():
        return PlatformAdminModel.create(
            email='ops@gmail.com',
            password='OpsPassword123!@#',
            display_name='Ops',
        )


@pytest.fixture
def platform_headers(app, platform_admin):
    with app.app_context():
        tok = create_access_token(
            identity=str(platform_admin['_id']),
            additional_claims={'is_platform_admin': True},
        )
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


@pytest.fixture
def regular_user_headers(app, db, test_user):
    """JWT without the platform-admin claim — should be denied 403."""
    with app.app_context():
        tok = create_access_token(identity=str(test_user['_id']))
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

class TestPlatformAdminGuard:
    def test_no_token_returns_401(self, client):
        r = client.get('/api/platform/me')
        assert r.status_code == 401

    def test_regular_user_jwt_is_rejected_403(self, client, regular_user_headers):
        r = client.get('/api/platform/me', headers=regular_user_headers)
        assert r.status_code == 403
        assert 'Platform admin' in r.get_json()['error']

    def test_claim_true_but_no_row_is_denied(self, app, db, client):
        """JWT carrying the platform claim but pointing at a non-existent row
        is rejected. The current implementation 401s via the JWT user-lookup
        hook before the decorator's own 404 path is reached — either is fine
        as long as access is denied."""
        with app.app_context():
            tok = create_access_token(
                identity=str(ObjectId()),
                additional_claims={'is_platform_admin': True},
            )
        r = client.get(
            '/api/platform/me',
            headers={'Authorization': f'Bearer {tok}'},
        )
        assert r.status_code in (401, 404)


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------

class TestMe:
    def test_returns_admin_profile_and_stamps_last_active(self, client, platform_admin, platform_headers):
        r = client.get('/api/platform/me', headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['email'] == 'ops@gmail.com'
        assert data['is_platform_admin'] is True
        assert data['role'] == 'platform_admin'

        refreshed = mongo.db.platform_admins.find_one({'_id': platform_admin['_id']})
        assert refreshed['last_active_at'] is not None


# ---------------------------------------------------------------------------
# /features GET + PUT
# ---------------------------------------------------------------------------

class TestFeatures:
    def test_get_features_returns_full_map(self, client, platform_headers):
        r = client.get('/api/platform/features', headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert 'features' in data
        assert 'arena' in data['features']

    def test_put_single_feature_toggle(self, client, platform_headers):
        # conftest seeds every feature True, so flip to False to register an actual change.
        r = client.put('/api/platform/features', json={'feature': 'arena', 'enabled': False},
                       headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['features']['arena'] is False
        assert any(c['name'] == 'arena' and c['new'] is False for c in data['changes'])

    def test_put_single_unknown_feature_400(self, client, platform_headers):
        r = client.put('/api/platform/features', json={'feature': 'nope', 'enabled': True},
                       headers=platform_headers)
        assert r.status_code == 400
        assert 'allowed' in r.get_json()

    def test_put_single_missing_enabled_400(self, client, platform_headers):
        r = client.put('/api/platform/features', json={'feature': 'arena'},
                       headers=platform_headers)
        assert r.status_code == 400

    def test_put_bulk_features(self, client, platform_headers):
        r = client.put('/api/platform/features',
                       json={'features': {'arena': True, 'debate': True}},
                       headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['features']['arena'] is True
        assert data['features']['debate'] is True

    def test_put_bulk_non_bool_value_400(self, client, platform_headers):
        r = client.put('/api/platform/features',
                       json={'features': {'arena': 'yes'}},
                       headers=platform_headers)
        assert r.status_code == 400

    def test_put_bulk_unknown_key_400(self, client, platform_headers):
        r = client.put('/api/platform/features',
                       json={'features': {'arena': True, 'wat': False}},
                       headers=platform_headers)
        assert r.status_code == 400
        assert 'Unknown' in r.get_json()['error']

    def test_put_empty_body_400(self, client, platform_headers):
        r = client.put('/api/platform/features', json={}, headers=platform_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# /audit
# ---------------------------------------------------------------------------

class TestAudit:
    def test_audit_paginated_and_includes_changes(self, client, platform_admin, platform_headers):
        # Each feature toggle that actually flips a value writes one audit row.
        # conftest seeds True; flipping to False = real change.
        client.put('/api/platform/features', json={'feature': 'arena', 'enabled': False},
                   headers=platform_headers)
        client.put('/api/platform/features', json={'feature': 'debate', 'enabled': False},
                   headers=platform_headers)

        r = client.get('/api/platform/audit', headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['total'] >= 2
        assert all(e.get('platform_admin', {}).get('email') == 'ops@gmail.com'
                   for e in data['events'])

    def test_audit_action_filter(self, client, platform_headers):
        client.put('/api/platform/features', json={'feature': 'arena', 'enabled': False},
                   headers=platform_headers)
        r = client.get('/api/platform/audit?action=feature_toggle', headers=platform_headers)
        assert r.status_code == 200
        for e in r.get_json()['events']:
            assert e['action'] == 'feature_toggle'

    def test_audit_limit_clamped(self, client, platform_headers):
        r = client.get('/api/platform/audit?limit=99999', headers=platform_headers)
        assert r.status_code == 200
        assert r.get_json()['limit'] == 200


# ---------------------------------------------------------------------------
# /holding/overview, /companies
# ---------------------------------------------------------------------------

class TestOverviewAndCompanies:
    def test_holding_overview_smoke(self, client, platform_headers):
        r = client.get('/api/platform/holding/overview', headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        for key in ('workspaces_count', 'projects_count', 'users_count',
                    'conversations_count', 'totals', 'daily',
                    'top_companies', 'top_models', 'by_role',
                    'holding_credits'):
            assert key in data

    def test_list_companies(self, app, db, client, platform_headers):
        from app.models.user import UserModel
        from app.models.workspace import WorkspaceModel
        with app.app_context():
            owner = UserModel.create(email='c@gmail.com', password='Pw123!@#',
                                     display_name='C', role='manager')
            WorkspaceModel.create('Cohort', owner['_id'], type='team')
        r = client.get('/api/platform/companies', headers=platform_headers)
        assert r.status_code == 200
        assert any(c['name'] == 'Cohort' for c in r.get_json()['companies'])

    def test_get_company_invalid_id_400(self, client, platform_headers):
        r = client.get('/api/platform/companies/not-an-oid', headers=platform_headers)
        assert r.status_code == 400

    def test_get_company_404_when_missing(self, client, platform_headers):
        r = client.get(f'/api/platform/companies/{ObjectId()}', headers=platform_headers)
        assert r.status_code == 404

    def test_get_company_200(self, app, db, client, platform_headers):
        from app.models.user import UserModel
        from app.models.workspace import WorkspaceModel
        with app.app_context():
            owner = UserModel.create(email='c2@gmail.com', password='Pw123!@#',
                                     display_name='C2', role='manager')
            ws = WorkspaceModel.create('Pixel', owner['_id'], type='team')
        r = client.get(f"/api/platform/companies/{ws['_id']}", headers=platform_headers)
        assert r.status_code == 200
        assert r.get_json()['workspace']['name'] == 'Pixel'

    def test_users_overview_invalid_role_400(self, client, platform_headers):
        r = client.get('/api/platform/users-overview?role=wizard', headers=platform_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Credits — company-scoped + holding-scoped
# ---------------------------------------------------------------------------

class TestCredits:
    def _mk_company(self, app):
        from app.models.user import UserModel
        from app.models.workspace import WorkspaceModel
        with app.app_context():
            owner = UserModel.create(email='oco@gmail.com', password='Pw123!@#',
                                     display_name='Owner', role='manager')
            ws = WorkspaceModel.create('Pay', owner['_id'], type='team')
            return ws

    def test_charge_company_invalid_id_400(self, client, platform_headers):
        r = client.post('/api/platform/companies/bad/credits',
                        json={'amount_usd': 10}, headers=platform_headers)
        assert r.status_code == 400

    def test_charge_company_workspace_not_found_404(self, client, platform_headers):
        r = client.post(f'/api/platform/companies/{ObjectId()}/credits',
                        json={'amount_usd': 10}, headers=platform_headers)
        assert r.status_code == 404

    def test_charge_company_zero_400(self, app, db, client, platform_headers):
        ws = self._mk_company(app)
        r = client.post(f"/api/platform/companies/{ws['_id']}/credits",
                        json={'amount_usd': 0}, headers=platform_headers)
        assert r.status_code == 400

    def test_charge_company_invalid_type_400(self, app, db, client, platform_headers):
        ws = self._mk_company(app)
        r = client.post(f"/api/platform/companies/{ws['_id']}/credits",
                        json={'amount_usd': 5, 'type': 'gift'}, headers=platform_headers)
        assert r.status_code == 400

    def test_charge_company_missing_amount_400(self, app, db, client, platform_headers):
        ws = self._mk_company(app)
        r = client.post(f"/api/platform/companies/{ws['_id']}/credits",
                        json={'type': 'top_up'}, headers=platform_headers)
        assert r.status_code == 400

    def test_charge_company_201_bumps_balance_and_writes_audit(
            self, app, db, client, platform_headers, platform_admin):
        ws = self._mk_company(app)
        r = client.post(
            f"/api/platform/companies/{ws['_id']}/credits",
            json={'amount_usd': 25.5, 'type': 'top_up', 'note': 'first'},
            headers=platform_headers,
        )
        assert r.status_code == 201
        data = r.get_json()
        assert data['credits_balance_usd'] == 25.5

        with app.app_context():
            ledger = list(mongo.db.credit_ledger.find({'workspace_id': ws['_id']}))
            assert len(ledger) == 1 and ledger[0]['amount_usd'] == 25.5
            ws_refreshed = mongo.db.workspaces.find_one({'_id': ws['_id']})
            assert ws_refreshed['credits_balance_usd'] == 25.5
            audit_row = mongo.db.platform_audit_logs.find_one(
                {'action': 'company_credits_added'}
            )
            assert audit_row is not None
            assert audit_row['platform_admin_id'] == platform_admin['_id']
            assert audit_row['details']['amount_usd'] == 25.5

    def test_charge_holding_zero_400(self, client, platform_headers):
        r = client.post('/api/platform/holding/credits', json={'amount_usd': 0},
                        headers=platform_headers)
        assert r.status_code == 400

    def test_charge_holding_201_bumps_topups(self, app, db, client, platform_headers):
        r = client.post('/api/platform/holding/credits',
                        json={'amount_usd': 99.0, 'type': 'top_up', 'note': 'seed'},
                        headers=platform_headers)
        assert r.status_code == 201
        assert r.get_json()['lifetime_topups_usd'] == 99.0

        with app.app_context():
            doc = mongo.db.platform_settings.find_one({'_id': 'singleton'})
            assert doc['holding_credits_topups_usd'] == 99.0
            audit = mongo.db.platform_audit_logs.find_one(
                {'action': 'holding_credits_added'}
            )
            assert audit is not None

    def test_holding_ledger_lists_entries(self, app, db, client, platform_headers):
        client.post('/api/platform/holding/credits',
                    json={'amount_usd': 10}, headers=platform_headers)
        client.post('/api/platform/holding/credits',
                    json={'amount_usd': 20}, headers=platform_headers)
        r = client.get('/api/platform/holding/ledger', headers=platform_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['total'] == 2
        amounts = sorted(e['amount_usd'] for e in data['entries'])
        assert amounts == [10.0, 20.0]
