"""
Tests for workspaces routes: CRUD, invites, and members.

All helpers are inlined — no new conftest fixtures.
"""

import pytest
from bson import ObjectId
from flask_jwt_extended import create_access_token


# ---------------------------------------------------------------------------
# Inline helpers
# ---------------------------------------------------------------------------

def _make_user(app, email, display_name='User'):
    from app.models.user import UserModel
    with app.app_context():
        return UserModel.create(email=email, password='Pw123!@#', display_name=display_name)


def _make_token(app, user):
    with app.app_context():
        return create_access_token(identity=str(user['_id']))


def _headers(app, user):
    tok = _make_token(app, user)
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


def _create_team_ws(client, headers, name='Team WS'):
    r = client.post('/api/workspaces/create', json={'name': name}, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


# ---------------------------------------------------------------------------
# TestWorkspaceCRUD
# ---------------------------------------------------------------------------

class TestWorkspaceCRUD:
    def test_list_returns_personal_workspace_for_new_user(self, app, db, client, test_user, auth_headers):
        r = client.get('/api/workspaces/list', headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert isinstance(data, list)
        assert len(data) >= 1
        personal = [ws for ws in data if ws.get('type') == 'personal']
        assert personal, "Expected at least one personal workspace"
        assert personal[0]['member_role'] == 'owner'

    def test_create_team_workspace(self, app, db, client, test_user, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel

        ws = _create_team_ws(client, auth_headers, name='My Team')
        assert ws['type'] == 'team'
        assert ws['name'] == 'My Team'

        with app.app_context():
            member = WorkspaceMemberModel.find(ws['_id'], str(test_user['_id']))
        assert member is not None
        assert member['role'] == 'owner'
        assert member['status'] == 'active'

    def test_create_rejects_blank_name(self, app, db, client, auth_headers):
        r = client.post('/api/workspaces/create', json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

        r2 = client.post('/api/workspaces/create', json={'name': ''}, headers=auth_headers)
        assert r2.status_code == 400

    def test_get_404_when_not_member(self, app, db, client, test_user, auth_headers):
        # Create a team ws as test_user
        ws = _create_team_ws(client, auth_headers, name='Private Team')

        # Second user has no membership
        u2 = _make_user(app, 'u2_get@example.com', 'U2')
        h2 = _headers(app, u2)

        r = client.get(f'/api/workspaces/{ws["_id"]}', headers=h2)
        assert r.status_code in (403, 404)

    def test_patch_owner_only(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Patch WS')
        wid = ws['_id']

        # Non-member u2 tries to patch
        u2 = _make_user(app, 'u2_patch@example.com', 'U2')
        h2 = _headers(app, u2)

        r = client.patch(f'/api/workspaces/{wid}', json={'name': 'Hacked'}, headers=h2)
        assert r.status_code == 403

    def test_delete_team_workspace_cascades(self, app, db, client, test_user, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel

        ws = _create_team_ws(client, auth_headers, name='To Delete')
        wid = ws['_id']

        with app.app_context():
            # Verify member row exists before delete
            members_before = WorkspaceMemberModel.find_by_workspace(wid, status='active')
        assert len(members_before) >= 1

        r = client.delete(f'/api/workspaces/{wid}', headers=auth_headers)
        assert r.status_code == 200

        with app.app_context():
            members_after = WorkspaceMemberModel.get_collection().find({'workspace_id': ObjectId(wid)})
            assert list(members_after) == []

    def test_delete_personal_workspace_refuses(self, app, db, client, test_user, auth_headers):
        # Get personal workspace id from list
        r = client.get('/api/workspaces/list', headers=auth_headers)
        workspaces = r.get_json()
        personal = [ws for ws in workspaces if ws.get('type') == 'personal']
        assert personal, "No personal workspace found"
        pid = personal[0]['_id']

        r2 = client.delete(f'/api/workspaces/{pid}', headers=auth_headers)
        assert r2.status_code == 403
        body = r2.get_json()
        assert body.get('code') == 'personal_workspace_immutable'


# ---------------------------------------------------------------------------
# TestWorkspaceInvites
# ---------------------------------------------------------------------------

class TestWorkspaceInvites:
    def _setup_ws_and_invite(self, app, client, headers, email='invitee@example.com'):
        """Returns (ws_dict, invite_dict)."""
        ws = _create_team_ws(client, headers, name='Invite WS')
        r = client.post(
            f'/api/workspaces/{ws["_id"]}/invites',
            json={'email': email, 'role': 'editor'},
            headers=headers,
        )
        assert r.status_code == 201, r.get_json()
        return ws, r.get_json()

    def test_create_invite_returns_token_url(self, app, db, client, test_user, auth_headers):
        ws, invite = self._setup_ws_and_invite(app, client, auth_headers)
        assert 'invite_url' in invite
        assert invite['invite_url'].startswith('/invite/')
        assert invite.get('token')

    def test_list_invites_pending_only(self, app, db, client, test_user, auth_headers):
        ws, invite = self._setup_ws_and_invite(
            app, client, auth_headers, email='pending@example.com'
        )
        wid = ws['_id']

        r = client.get(f'/api/workspaces/{wid}/invites', headers=auth_headers)
        assert r.status_code == 200
        invites = r.get_json()
        assert isinstance(invites, list)
        assert len(invites) >= 1

        # Create a second user who accepts the invite
        u2 = _make_user(app, 'pending@example.com', 'Pending')
        h2 = _headers(app, u2)
        r2 = client.post('/api/workspaces/accept-invite', json={'token': invite['token']}, headers=h2)
        assert r2.status_code == 200

        # After accept, the invite should no longer appear in the pending list
        r3 = client.get(f'/api/workspaces/{wid}/invites', headers=auth_headers)
        tokens_in_list = [i.get('token') for i in r3.get_json()]
        assert invite['token'] not in tokens_in_list

    def test_revoke_invite(self, app, db, client, test_user, auth_headers):
        ws, invite = self._setup_ws_and_invite(
            app, client, auth_headers, email='revoke@example.com'
        )
        wid = ws['_id']
        token = invite['token']

        r = client.delete(f'/api/workspaces/{wid}/invites/{token}', headers=auth_headers)
        assert r.status_code == 200

        # Now a user with that email cannot accept
        u2 = _make_user(app, 'revoke@example.com', 'Revoke')
        h2 = _headers(app, u2)
        r2 = client.post('/api/workspaces/accept-invite', json={'token': token}, headers=h2)
        assert r2.status_code in (400, 404)

    def test_accept_invite_email_mismatch_403(self, app, db, client, test_user, auth_headers):
        ws, invite = self._setup_ws_and_invite(
            app, client, auth_headers, email='a@x.com'
        )

        # User with different email tries to accept
        u2 = _make_user(app, 'b@x.com', 'B User')
        h2 = _headers(app, u2)
        r = client.post('/api/workspaces/accept-invite', json={'token': invite['token']}, headers=h2)
        assert r.status_code == 403
        body = r.get_json()
        assert 'mismatch' in (body.get('error', '') + str(body)).lower()

    def test_accept_invite_adds_membership(self, app, db, client, test_user, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel

        ws, invite = self._setup_ws_and_invite(
            app, client, auth_headers, email='newmember@example.com'
        )
        wid = ws['_id']

        u2 = _make_user(app, 'newmember@example.com', 'New Member')
        h2 = _headers(app, u2)
        r = client.post('/api/workspaces/accept-invite', json={'token': invite['token']}, headers=h2)
        assert r.status_code == 200

        # Verify membership row
        with app.app_context():
            member = WorkspaceMemberModel.find(wid, str(u2['_id']))
        assert member is not None
        assert member['status'] == 'active'

        # And the member appears in the members list
        r2 = client.get(f'/api/workspaces/{wid}/members', headers=auth_headers)
        assert r2.status_code == 200
        member_ids = [m['user']['id'] for m in r2.get_json()]
        assert str(u2['_id']) in member_ids


# ---------------------------------------------------------------------------
# TestWorkspaceMembers
# ---------------------------------------------------------------------------

class TestWorkspaceMembers:
    def _ws_with_two_owners(self, app, client, auth_headers):
        """Create a team WS, invite a second owner, return (ws_dict, u2, h2)."""
        ws = _create_team_ws(client, auth_headers, name='Two Owner WS')
        wid = ws['_id']

        u2 = _make_user(app, 'second_owner@example.com', 'Second Owner')
        h2 = _headers(app, u2)

        # Invite u2 as editor then manually promote to owner via direct model call
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'owner', status='active')

        return ws, u2, h2

    def test_list_members_hydrated(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Hydrate WS')
        r = client.get(f'/api/workspaces/{ws["_id"]}/members', headers=auth_headers)
        assert r.status_code == 200
        members = r.get_json()
        assert len(members) >= 1
        for m in members:
            assert 'user' in m
            assert 'email' in m['user']

    def test_update_member_role_owner_only(self, app, db, client, test_user, auth_headers):
        ws, u2, h2 = self._ws_with_two_owners(app, client, auth_headers)
        wid = ws['_id']
        uid1 = str(test_user['_id'])

        # u2 is owner but tries to demote test_user (also owner) — first add a third user as viewer
        u3 = _make_user(app, 'viewer@example.com', 'Viewer')
        h3 = _headers(app, u3)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u3['_id']), 'viewer', status='active')

        uid3 = str(u3['_id'])

        # Non-owner cannot patch (u3 is viewer)
        r = client.patch(
            f'/api/workspaces/{wid}/members/{uid1}',
            json={'role': 'editor'},
            headers=h3,
        )
        assert r.status_code == 403

        # Owner can patch
        r2 = client.patch(
            f'/api/workspaces/{wid}/members/{uid3}',
            json={'role': 'editor'},
            headers=auth_headers,
        )
        assert r2.status_code == 200
        assert r2.get_json().get('role') == 'editor'

    def test_demote_last_owner_blocked(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Last Owner WS')
        wid = ws['_id']
        uid = str(test_user['_id'])

        r = client.patch(
            f'/api/workspaces/{wid}/members/{uid}',
            json={'role': 'editor'},
            headers=auth_headers,
        )
        assert r.status_code == 400
        body = r.get_json()
        assert body.get('code') == 'last_owner_protected'

    def test_remove_last_owner_blocked(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Remove Last Owner WS')
        wid = ws['_id']
        uid = str(test_user['_id'])

        r = client.delete(
            f'/api/workspaces/{wid}/members/{uid}',
            headers=auth_headers,
        )
        assert r.status_code == 400
        body = r.get_json()
        assert body.get('code') == 'last_owner_protected'


# ---------------------------------------------------------------------------
# TestWorkspaceOverview
# ---------------------------------------------------------------------------

class TestWorkspaceOverview:
    def test_overview_shape(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Overview WS')
        wid = ws['_id']

        r = client.get(f'/api/workspaces/{wid}/overview', headers=auth_headers)
        assert r.status_code == 200, r.get_json()
        body = r.get_json()

        # Required top-level keys
        for k in ('workspace', 'billing', 'top_projects', 'recent_activity',
                  'groups', 'usage_30d', 'stats'):
            assert k in body, f"missing key: {k}"

        # Billing block keys
        billing = body['billing']
        for k in ('plan_tier', 'credits_balance_usd', 'spend_mtd_usd',
                  'seats_used', 'seats_total', 'sso_enforced', 'scim_enabled'):
            assert k in billing, f"missing billing.{k}"

        # Stats block keys
        stats = body['stats']
        for k in ('messages_mtd', 'active_projects', 'members_active'):
            assert k in stats, f"missing stats.{k}"

        # Defaults: at least the creator counts as active member.
        assert billing['seats_used'] >= 1


# ---------------------------------------------------------------------------
# TestWorkspaceBilling
# ---------------------------------------------------------------------------

class TestWorkspaceBilling:
    def test_add_credits_appends_ledger_and_updates_balance(
        self, app, db, client, test_user, auth_headers,
    ):
        from app.models.workspace import WorkspaceModel
        from app.models.credit_ledger import CreditLedgerModel

        ws = _create_team_ws(client, auth_headers, name='Billing WS')
        wid = ws['_id']

        r = client.post(
            f'/api/workspaces/{wid}/billing/credits',
            json={'amount_usd': 100.0, 'note': 'initial top-up', 'type': 'top_up'},
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        body = r.get_json()
        assert abs(body['credits_balance_usd'] - 100.0) < 1e-9
        assert body['entry']['amount_usd'] == 100.0

        # Workspace doc reflects new balance.
        with app.app_context():
            ws_doc = WorkspaceModel.find_by_id(wid)
        assert abs(float(ws_doc['credits_balance_usd']) - 100.0) < 1e-9

        # A second adjustment subtracts.
        r2 = client.post(
            f'/api/workspaces/{wid}/billing/credits',
            json={'amount_usd': -25.5, 'note': 'refund clawback', 'type': 'adjustment'},
            headers=auth_headers,
        )
        assert r2.status_code == 201
        assert abs(r2.get_json()['credits_balance_usd'] - 74.5) < 1e-9

        with app.app_context():
            entries = CreditLedgerModel.find_by_workspace(wid)
        assert len(entries) == 2

    def test_add_credits_owner_only(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Billing Owner WS')
        wid = ws['_id']

        u2 = _make_user(app, 'editor_billing@example.com', 'Editor')
        h2 = _headers(app, u2)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'editor', status='active')

        r = client.post(
            f'/api/workspaces/{wid}/billing/credits',
            json={'amount_usd': 50.0, 'note': 'naughty', 'type': 'top_up'},
            headers=h2,
        )
        assert r.status_code == 403

    def test_billing_usage_returns_aggregations(
        self, app, db, client, test_user, auth_headers,
    ):
        from datetime import datetime
        from bson import ObjectId

        ws = _create_team_ws(client, auth_headers, name='Billing Usage WS')
        wid = ws['_id']

        # Seed two usage_log rows scoped to this workspace.
        with app.app_context():
            db['usage_logs'].insert_one({
                'user_id': test_user['_id'],
                'workspace_id': ObjectId(wid),
                'project_id': None,
                'model_id': 'openai/gpt-test',
                'model': 'openai/gpt-test',
                'prompt_tokens': 100,
                'completion_tokens': 50,
                'tokens': {'prompt': 100, 'completion': 50, 'total': 150},
                'cost_usd': 0.10,
                'feature': 'chat',
                'created_at': datetime.utcnow(),
            })
            db['usage_logs'].insert_one({
                'user_id': test_user['_id'],
                'workspace_id': ObjectId(wid),
                'project_id': None,
                'model_id': 'anthropic/claude',
                'model': 'anthropic/claude',
                'prompt_tokens': 200,
                'completion_tokens': 50,
                'tokens': {'prompt': 200, 'completion': 50, 'total': 250},
                'cost_usd': 0.30,
                'feature': 'chat',
                'created_at': datetime.utcnow(),
            })

        r = client.get(f'/api/workspaces/{wid}/billing/usage', headers=auth_headers)
        assert r.status_code == 200, r.get_json()
        body = r.get_json()

        for k in ('by_user', 'by_project', 'by_model', 'daily', 'totals', 'window'):
            assert k in body

        assert abs(body['totals']['cost_usd'] - 0.40) < 1e-9
        assert body['totals']['messages'] == 2

        models = {row['model'] for row in body['by_model']}
        assert 'openai/gpt-test' in models
        assert 'anthropic/claude' in models

    def test_billing_ledger_billing_admin_role(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Billing Ledger WS')
        wid = ws['_id']

        # Owner can read.
        r = client.get(f'/api/workspaces/{wid}/billing/ledger', headers=auth_headers)
        assert r.status_code == 200

        # Editor cannot — different tier.
        u2 = _make_user(app, 'editor_ledger@example.com', 'Editor')
        h2 = _headers(app, u2)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'editor', status='active')
        r2 = client.get(f'/api/workspaces/{wid}/billing/ledger', headers=h2)
        assert r2.status_code == 403

        # billing-admin user can.
        u3 = _make_user(app, 'billing_admin@example.com', 'BA')
        h3 = _headers(app, u3)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u3['_id']), 'billing-admin', status='active')
        r3 = client.get(f'/api/workspaces/{wid}/billing/ledger', headers=h3)
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# TestWorkspaceAudit
# ---------------------------------------------------------------------------

class TestWorkspaceAudit:
    def _seed_audit_rows(self, app, wid, count=3, action='workspace.update', actor_id=None):
        """Insert ``count`` audit_log rows scoped to this workspace."""
        from datetime import datetime, timedelta
        from bson import ObjectId
        from app.models.audit_log import AuditLogModel

        ids = []
        with app.app_context():
            now = datetime.utcnow()
            for i in range(count):
                doc = {
                    'action': action,
                    'admin_id': actor_id if actor_id else None,
                    'target_id': ObjectId(wid),
                    'target_type': 'workspace',
                    'details': {'workspace_id': str(wid), 'i': i},
                    'ip_address': None,
                    # Newest first index 0 — older as i grows.
                    'created_at': now - timedelta(seconds=i * 10),
                }
                res = AuditLogModel.get_collection().insert_one(doc)
                ids.append(res.inserted_id)
        return ids

    def test_returns_entries(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Audit WS')
        wid = ws['_id']

        self._seed_audit_rows(app, wid, count=3, actor_id=test_user['_id'])

        r = client.get(f'/api/workspaces/{wid}/audit', headers=auth_headers)
        assert r.status_code == 200, r.get_json()
        body = r.get_json()
        assert 'entries' in body
        assert 'next_before' in body
        assert isinstance(body['entries'], list)
        assert len(body['entries']) >= 3
        # Actor hydration.
        first = body['entries'][0]
        assert 'actor' in first
        if first['actor']:
            assert 'password_hash' not in first['actor']
            assert first['actor'].get('email') == test_user['email']

    def test_admin_only_editor_forbidden(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Audit Admin WS')
        wid = ws['_id']

        u2 = _make_user(app, 'audit_editor@example.com', 'Editor')
        h2 = _headers(app, u2)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'editor', status='active')

        r = client.get(f'/api/workspaces/{wid}/audit', headers=h2)
        assert r.status_code == 403

    def test_pagination_before_param(self, app, db, client, test_user, auth_headers):
        from datetime import datetime, timedelta

        ws = _create_team_ws(client, auth_headers, name='Audit Page WS')
        wid = ws['_id']

        self._seed_audit_rows(app, wid, count=5, actor_id=test_user['_id'])

        # All entries.
        r_all = client.get(f'/api/workspaces/{wid}/audit?limit=200', headers=auth_headers)
        assert r_all.status_code == 200
        all_count = len(r_all.get_json()['entries'])
        assert all_count >= 5

        # Pick the second-newest entry's created_at as a cursor.
        second = r_all.get_json()['entries'][1]
        cursor = second['created_at']

        r_before = client.get(
            f'/api/workspaces/{wid}/audit?limit=200&before={cursor}',
            headers=auth_headers,
        )
        assert r_before.status_code == 200
        before_count = len(r_before.get_json()['entries'])
        assert before_count < all_count

    def test_action_filter(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Audit Action WS')
        wid = ws['_id']

        self._seed_audit_rows(app, wid, count=3, action='workspace.update',
                              actor_id=test_user['_id'])
        self._seed_audit_rows(app, wid, count=2, action='member.add',
                              actor_id=test_user['_id'])

        r = client.get(
            f'/api/workspaces/{wid}/audit?action=member.add&limit=200',
            headers=auth_headers,
        )
        assert r.status_code == 200
        entries = r.get_json()['entries']
        assert len(entries) == 2
        for e in entries:
            assert e['action'] == 'member.add'


# ---------------------------------------------------------------------------
# TestWorkspacePolicyFields
# ---------------------------------------------------------------------------

class TestWorkspacePolicyFields:
    def test_patch_accepts_policy_fields(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Policy WS')
        wid = ws['_id']

        r = client.patch(
            f'/api/workspaces/{wid}',
            json={
                'ip_allowlist': ['10.0.0.0/8', '192.168.1.0/24'],
                'enforce_2fa': True,
                'plan_tier': 'enterprise',
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.get_json()
        body = r.get_json()
        assert body.get('ip_allowlist') == ['10.0.0.0/8', '192.168.1.0/24']
        assert body.get('enforce_2fa') is True
        assert body.get('plan_tier') == 'enterprise'

    def test_invalid_plan_tier_400(self, app, db, client, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='Plan Bad WS')
        wid = ws['_id']

        r = client.patch(
            f'/api/workspaces/{wid}',
            json={'plan_tier': 'platinum'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_ip_allowlist_non_list(self, app, db, client, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='IP Bad WS')
        wid = ws['_id']

        r = client.patch(
            f'/api/workspaces/{wid}',
            json={'ip_allowlist': 'not-a-list'},
            headers=auth_headers,
        )
        assert r.status_code == 400
