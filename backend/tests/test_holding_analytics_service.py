"""Tests for app/services/holding_analytics.py — cross-company aggregations.

Seeds workspaces + projects + usage_logs + credit_ledger directly via the
models / collections and exercises every public function: list_companies,
company_detail, users_overview, holding_overview.
"""

from datetime import datetime, timedelta

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.services import holding_analytics


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _mk_user(db, email, role='user', display_name='U'):
    from app.models.user import UserModel
    return UserModel.create(email=email, password='Pw123!@#', display_name=display_name, role=role)


def _mk_team_ws(db, name, owner_id):
    from app.models.workspace import WorkspaceModel
    return WorkspaceModel.create(name=name, owner_id=owner_id, type='team')


def _mk_project(db, workspace_id, name='P', owner_id=None, archived=False):
    if isinstance(workspace_id, str):
        workspace_id = ObjectId(workspace_id)
    now = datetime.utcnow()
    doc = {
        'name': name,
        'slug': name.lower(),
        'workspace_id': workspace_id,
        'owner_id': owner_id if isinstance(owner_id, ObjectId) or owner_id is None else ObjectId(owner_id),
        'archived': archived,
        'pinned': False,
        'created_at': now,
        'updated_at': now,
    }
    result = mongo.db.projects.insert_one(doc)
    doc['_id'] = result.inserted_id
    return doc


def _mk_conversation(db, project_id, user_id):
    now = datetime.utcnow()
    doc = {
        'project_id': project_id,
        'user_id': user_id,
        'created_at': now,
        'updated_at': now,
        'last_message_at': now,
    }
    r = mongo.db.conversations.insert_one(doc)
    doc['_id'] = r.inserted_id
    return doc


def _mk_member(db, workspace_id, user_id, role='editor', status='active'):
    now = datetime.utcnow()
    doc = {
        'workspace_id': workspace_id,
        'user_id': user_id,
        'role': role,
        'status': status,
        'created_at': now,
    }
    mongo.db.workspace_members.insert_one(doc)


def _mk_usage(db, *, user_id, workspace_id=None, project_id=None,
              model='openai/gpt-4', cost=1.0, prompt=10, completion=5,
              created_at=None):
    """Direct insert mirroring UsageLogModel doc shape."""
    doc = {
        'user_id': user_id,
        'workspace_id': workspace_id,
        'project_id': project_id,
        'model': model,
        'cost_usd': float(cost),
        'prompt_tokens': int(prompt),
        'completion_tokens': int(completion),
        'total_tokens': int(prompt + completion),
        'cached_tokens': 0,
        'origin': 'chat',
        'created_at': created_at or datetime.utcnow(),
    }
    mongo.db.usage_logs.insert_one(doc)
    return doc


# ---------------------------------------------------------------------------
# list_companies
# ---------------------------------------------------------------------------

class TestListCompanies:
    def test_empty_returns_zero_totals(self, app, db):
        out = holding_analytics.list_companies(days=30)
        assert out['companies'] == []
        assert out['totals']['companies'] == 0
        assert out['totals']['cost_30d'] == 0.0
        assert out['days'] == 30

    def test_aggregates_members_projects_conversations_and_usage(self, app, db):
        owner = _mk_user(db, 'owner@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'Acme', owner['_id'])
        # owner is the first member
        _mk_member(db, ws['_id'], owner['_id'], role='owner')
        u2 = _mk_user(db, 'm2@gmail.com')
        _mk_member(db, ws['_id'], u2['_id'])

        p1 = _mk_project(db, ws['_id'], name='Alpha')
        p2 = _mk_project(db, ws['_id'], name='Beta')
        _mk_project(db, ws['_id'], name='Gone', archived=True)  # archived ignored

        _mk_conversation(db, p1['_id'], owner['_id'])
        _mk_conversation(db, p1['_id'], owner['_id'])
        _mk_conversation(db, p2['_id'], owner['_id'])

        _mk_usage(db, user_id=owner['_id'], workspace_id=ws['_id'],
                  project_id=p1['_id'], cost=1.25, prompt=100, completion=50)
        _mk_usage(db, user_id=u2['_id'], workspace_id=ws['_id'],
                  project_id=p1['_id'], cost=0.75, prompt=20, completion=30)

        out = holding_analytics.list_companies(days=30)
        assert len(out['companies']) == 1
        row = out['companies'][0]
        assert row['name'] == 'Acme'
        assert row['member_count'] == 2
        assert row['project_count'] == 2          # archived excluded
        assert row['conversation_count'] == 3
        assert row['usage_30d']['cost_usd'] == 2.0
        assert row['usage_30d']['tokens'] == 200  # 100+50+20+30
        assert row['usage_30d']['calls'] == 2

        tot = out['totals']
        assert tot['companies'] == 1
        assert tot['members'] == 2
        assert tot['projects'] == 2
        assert tot['conversations'] == 3
        assert tot['cost_30d'] == 2.0
        assert tot['tokens_30d'] == 200
        assert tot['calls_30d'] == 2

    def test_excludes_personal_workspaces(self, app, db):
        # Personal workspace from auto-create on UserModel.create
        u = _mk_user(db, 'lone@gmail.com')
        # Manually create a 'personal' type ws to ensure filter holds
        from app.models.workspace import WorkspaceModel
        WorkspaceModel.create(name='Personal', owner_id=u['_id'], type='personal')

        out = holding_analytics.list_companies(days=30)
        assert all(c.get('name') != 'Personal' for c in out['companies'])

    def test_window_filter_excludes_old_usage(self, app, db):
        owner = _mk_user(db, 'old@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'OldCo', owner['_id'])
        _mk_usage(
            db, user_id=owner['_id'], workspace_id=ws['_id'],
            cost=99.0, created_at=datetime.utcnow() - timedelta(days=60),
        )
        out = holding_analytics.list_companies(days=30)
        row = next(r for r in out['companies'] if r['name'] == 'OldCo')
        assert row['usage_30d']['cost_usd'] == 0.0


# ---------------------------------------------------------------------------
# company_detail
# ---------------------------------------------------------------------------

class TestCompanyDetail:
    def test_invalid_id_returns_none(self, app, db):
        assert holding_analytics.company_detail('not-an-oid') is None

    def test_missing_workspace_returns_none(self, app, db):
        assert holding_analytics.company_detail(ObjectId()) is None

    def test_projects_top_users_top_models_and_daily(self, app, db):
        owner = _mk_user(db, 'co@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'Detailed', owner['_id'])
        _mk_member(db, ws['_id'], owner['_id'], role='owner')
        u2 = _mk_user(db, 'co2@gmail.com')
        _mk_member(db, ws['_id'], u2['_id'])

        p1 = _mk_project(db, ws['_id'], name='Hot')
        p2 = _mk_project(db, ws['_id'], name='Cold')

        _mk_usage(db, user_id=owner['_id'], workspace_id=ws['_id'],
                  project_id=p1['_id'], cost=5.0, model='openai/gpt-4')
        _mk_usage(db, user_id=u2['_id'], workspace_id=ws['_id'],
                  project_id=p1['_id'], cost=2.0, model='openai/gpt-4')
        _mk_usage(db, user_id=u2['_id'], workspace_id=ws['_id'],
                  project_id=p2['_id'], cost=1.0, model='anthropic/claude')

        out = holding_analytics.company_detail(ws['_id'], days=7)
        assert out is not None
        assert out['member_count'] == 2
        assert out['project_count'] == 2
        # Projects sorted by cost desc
        assert [p['name'] for p in out['projects']] == ['Hot', 'Cold']
        assert out['projects'][0]['cost_usd'] == 7.0
        assert out['projects'][1]['cost_usd'] == 1.0
        # top_users sorted by cost desc
        assert out['top_users'][0]['email'] == 'co@gmail.com'
        # top_models sorted by cost desc
        assert out['top_models'][0]['model'] == 'openai/gpt-4'
        assert out['top_models'][0]['cost_usd'] == 7.0
        # daily has exactly `days` entries
        assert len(out['daily']) == 7
        assert all('date' in d and 'cost_usd' in d for d in out['daily'])

    def test_credits_block_uses_ledger(self, app, db):
        from app.models.credit_ledger import CreditLedgerModel
        owner = _mk_user(db, 'credit@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'CreditCo', owner['_id'])
        CreditLedgerModel.add_entry(
            workspace_id=ws['_id'], amount_usd=10.0, type='top_up',
            note='seed', added_by=owner['_id'],
        )
        _mk_usage(db, user_id=owner['_id'], workspace_id=ws['_id'], cost=3.0)

        out = holding_analytics.company_detail(ws['_id'])
        cred = out['credits']
        assert cred['lifetime_topups_usd'] == 10.0
        assert cred['lifetime_spend_usd'] == 3.0
        assert cred['remaining_usd'] == 7.0

    def test_accepts_string_workspace_id(self, app, db):
        owner = _mk_user(db, 'str@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'StrCo', owner['_id'])
        out = holding_analytics.company_detail(str(ws['_id']))
        assert out is not None and out['workspace']['name'] == 'StrCo'


# ---------------------------------------------------------------------------
# users_overview
# ---------------------------------------------------------------------------

class TestUsersOverview:
    def test_empty_returns_zero_totals(self, app, db):
        out = holding_analytics.users_overview()
        assert out['users'] == []
        assert out['total'] == 0
        assert out['totals']['users'] == 0

    def test_aggregates_cost_and_workspace_count(self, app, db):
        owner = _mk_user(db, 'top@gmail.com', role='manager')
        ws = _mk_team_ws(db, 'WsA', owner['_id'])
        _mk_member(db, ws['_id'], owner['_id'], role='owner')
        _mk_usage(db, user_id=owner['_id'], workspace_id=ws['_id'], cost=4.2)

        out = holding_analytics.users_overview(days=30)
        row = next(r for r in out['users'] if r['email'] == 'top@gmail.com')
        assert row['cost_usd'] == 4.2
        # UserModel.create auto-makes a personal workspace + owner membership,
        # so the team workspace pushes the count to 2.
        assert row['workspaces_count'] == 2

    def test_search_filters_by_email(self, app, db):
        _mk_user(db, 'alice@gmail.com')
        _mk_user(db, 'bob@gmail.com')
        out = holding_analytics.users_overview(search='alice')
        assert len(out['users']) == 1
        assert out['users'][0]['email'] == 'alice@gmail.com'

    def test_role_filter_valid(self, app, db):
        _mk_user(db, 'mgr@gmail.com', role='manager')
        _mk_user(db, 'reg@gmail.com', role='user')
        out = holding_analytics.users_overview(role='manager')
        emails = {u['email'] for u in out['users']}
        assert 'mgr@gmail.com' in emails
        assert 'reg@gmail.com' not in emails

    def test_role_filter_invalid_raises(self, app, db):
        with pytest.raises(ValueError):
            holding_analytics.users_overview(role='wizard')

    def test_pagination(self, app, db):
        for i in range(5):
            u = _mk_user(db, f'p{i}@gmail.com')
            _mk_usage(db, user_id=u['_id'], cost=float(i))  # ensures sort order

        out = holding_analytics.users_overview(limit=2, page=1)
        assert len(out['users']) == 2
        assert out['total'] >= 5
        assert out['page'] == 1
        assert out['limit'] == 2


# ---------------------------------------------------------------------------
# holding_overview
# ---------------------------------------------------------------------------

class TestHoldingOverview:
    def test_empty_database_returns_zeros(self, app, db):
        out = holding_analytics.holding_overview(days=30)
        assert out['workspaces_count'] == 0
        assert out['users_count'] == 0
        assert out['totals'] == {'cost_usd': 0.0, 'tokens': 0, 'calls': 0}
        assert out['ceo'] is None
        assert len(out['daily']) == 30
        assert out['top_companies'] == []
        assert out['top_models'] == []
        assert out['holding_credits']['lifetime_topups_usd'] == 0.0

    def test_ceo_picked_as_oldest_admin(self, app, db):
        _mk_user(db, 'newadmin@gmail.com', role='admin', display_name='New')
        # second admin with a manually earlier created_at
        from app.models.user import UserModel
        boss = UserModel.create(email='boss@gmail.com', password='Pw123!@#',
                                display_name='Boss', role='admin')
        mongo.db.users.update_one(
            {'_id': boss['_id']},
            {'$set': {'created_at': datetime.utcnow() - timedelta(days=365)}},
        )
        out = holding_analytics.holding_overview()
        assert out['ceo']['email'] == 'boss@gmail.com'

    def test_top_companies_and_models_sorted(self, app, db):
        u1 = _mk_user(db, 'h1@gmail.com', role='manager')
        ws1 = _mk_team_ws(db, 'BigCo', u1['_id'])
        ws2 = _mk_team_ws(db, 'SmallCo', u1['_id'])
        _mk_usage(db, user_id=u1['_id'], workspace_id=ws1['_id'], cost=10.0, model='m-big')
        _mk_usage(db, user_id=u1['_id'], workspace_id=ws2['_id'], cost=1.0, model='m-small')

        out = holding_analytics.holding_overview()
        assert out['top_companies'][0]['name'] == 'BigCo'
        assert out['top_companies'][0]['cost_usd'] == 10.0
        assert out['top_models'][0]['model'] == 'm-big'

    def test_holding_credits_uses_platform_settings(self, app, db):
        from app.models.platform_settings import PlatformSettingsModel
        # Bump topups via the model API (avoids hand-editing collections).
        PlatformSettingsModel.add_holding_credits(123.45, by=ObjectId())
        u = _mk_user(db, 'spend@gmail.com')
        _mk_usage(db, user_id=u['_id'], cost=20.0)

        out = holding_analytics.holding_overview()
        assert out['holding_credits']['lifetime_topups_usd'] == 123.45
        assert out['holding_credits']['lifetime_spend_usd'] == 20.0
        assert out['holding_credits']['remaining_usd'] == 103.45
