"""Holding-wide analytics service.

Single source of truth for the cross-company aggregations consumed by both
the CEO panel (`/api/admin/companies*`, `/api/admin/users-overview`) and the
platform-operator panel (`/api/platform/companies*`, `/api/platform/users-overview`).

Pure data layer — returns JSON-serialisable dicts (uses `serialize_doc` for the
ObjectId/datetime conversion). No request/decorator concerns.
"""

from datetime import datetime, timedelta
import re

from bson import ObjectId

from app.extensions import mongo
from app.models.credit_ledger import CreditLedgerModel
from app.models.user import VALID_USER_ROLES
from app.utils.helpers import serialize_doc


def _empty_totals(days: int = 30) -> dict:
    return {
        'companies': 0, 'members': 0, 'projects': 0, 'conversations': 0,
        f'cost_{days}d': 0.0, f'tokens_{days}d': 0, f'calls_{days}d': 0,
        'credits_balance_usd': 0.0,
    }


def list_companies(days: int = 30) -> dict:
    """Return aggregated stats for every team workspace."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    workspaces = list(mongo.db.workspaces.find({'type': 'team'}).sort('created_at', -1))
    if not workspaces:
        return {'companies': [], 'totals': _empty_totals(days), 'days': days}

    wids = [w['_id'] for w in workspaces]

    member_counts = {}
    for row in mongo.db.workspace_members.aggregate([
        {'$match': {'workspace_id': {'$in': wids}, 'status': 'active'}},
        {'$group': {'_id': '$workspace_id', 'count': {'$sum': 1}}},
    ]):
        member_counts[row['_id']] = row['count']

    project_counts = {}
    for row in mongo.db.projects.aggregate([
        {'$match': {'workspace_id': {'$in': wids}, 'archived': {'$ne': True}}},
        {'$group': {'_id': '$workspace_id', 'count': {'$sum': 1}}},
    ]):
        project_counts[row['_id']] = row['count']

    conv_counts = {}
    for row in mongo.db.conversations.aggregate([
        {'$lookup': {'from': 'projects', 'localField': 'project_id', 'foreignField': '_id', 'as': 'p'}},
        {'$unwind': {'path': '$p', 'preserveNullAndEmptyArrays': False}},
        {'$match': {'p.workspace_id': {'$in': wids}}},
        {'$group': {'_id': '$p.workspace_id', 'count': {'$sum': 1}}},
    ]):
        conv_counts[row['_id']] = row['count']

    usage = {}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': {'$in': wids}, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$workspace_id',
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
    ]):
        usage[row['_id']] = row

    out = []
    for w in workspaces:
        wid = w['_id']
        u = usage.get(wid, {})
        out.append({
            '_id': str(wid),
            'name': w.get('name'),
            'slug': w.get('slug'),
            'domain': w.get('domain'),
            'created_at': w.get('created_at'),
            'owner_id': str(w.get('owner_id')) if w.get('owner_id') else None,
            'plan_tier': w.get('plan_tier'),
            'credits_balance_usd': float(w.get('credits_balance_usd', 0) or 0),
            'member_count': member_counts.get(wid, 0),
            'project_count': project_counts.get(wid, 0),
            'conversation_count': conv_counts.get(wid, 0),
            f'usage_{days}d': {
                'cost_usd': round(float(u.get('cost_usd', 0) or 0), 4),
                'tokens':   int(u.get('tokens', 0) or 0),
                'calls':    int(u.get('calls', 0) or 0),
            },
        })

    totals = {
        'companies': len(workspaces),
        'members':   sum(member_counts.values()),
        'projects':  sum(project_counts.values()),
        'conversations': sum(conv_counts.values()),
        f'cost_{days}d':   round(sum(float(v.get('cost_usd', 0) or 0) for v in usage.values()), 4),
        f'tokens_{days}d': sum(int(v.get('tokens', 0) or 0) for v in usage.values()),
        f'calls_{days}d':  sum(int(v.get('calls', 0) or 0) for v in usage.values()),
        'credits_balance_usd': round(sum(float(w.get('credits_balance_usd', 0) or 0) for w in workspaces), 2),
    }

    return {'companies': serialize_doc(out), 'totals': totals, 'days': days}


def company_detail(wid, days: int = 30):
    """Per-company drill-down. Returns ``None`` if workspace not found."""
    if isinstance(wid, str):
        if not ObjectId.is_valid(wid):
            return None
        ws_id = ObjectId(wid)
    else:
        ws_id = wid

    cutoff = datetime.utcnow() - timedelta(days=days)
    workspace = mongo.db.workspaces.find_one({'_id': ws_id})
    if not workspace:
        return None

    projects = list(mongo.db.projects.find({'workspace_id': ws_id}))
    project_ids = [p['_id'] for p in projects]
    project_usage = {}
    if project_ids:
        for row in mongo.db.usage_logs.aggregate([
            {'$match': {'project_id': {'$in': project_ids}, 'created_at': {'$gte': cutoff}}},
            {'$group': {
                '_id': '$project_id',
                'cost_usd': {'$sum': '$cost_usd'},
                'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
                'calls':    {'$sum': 1},
            }},
        ]):
            project_usage[row['_id']] = row

    project_rows = []
    for p in projects:
        u = project_usage.get(p['_id'], {})
        project_rows.append({
            '_id': str(p['_id']),
            'name': p.get('name'),
            'archived': bool(p.get('archived')),
            'pinned': bool(p.get('pinned')),
            'cost_usd': round(float(u.get('cost_usd', 0) or 0), 4),
            'tokens': int(u.get('tokens', 0) or 0),
            'calls': int(u.get('calls', 0) or 0),
        })
    project_rows.sort(key=lambda r: r['cost_usd'], reverse=True)

    top_users = []
    user_rollup = list(mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': ws_id, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$user_id',
            'cost_usd': {'$sum': '$cost_usd'},
            'calls':    {'$sum': 1},
        }},
        {'$sort': {'cost_usd': -1}},
        {'$limit': 10},
    ]))
    if user_rollup:
        uids = [r['_id'] for r in user_rollup if r.get('_id')]
        users = {u['_id']: u for u in mongo.db.users.find(
            {'_id': {'$in': uids}},
            {'email': 1, 'profile.display_name': 1, 'role': 1},
        )}
        for r in user_rollup:
            u = users.get(r['_id'], {})
            top_users.append({
                '_id': str(r['_id']),
                'email': u.get('email'),
                'name': (u.get('profile') or {}).get('display_name'),
                'role': u.get('role'),
                'cost_usd': round(float(r.get('cost_usd', 0) or 0), 4),
                'calls': int(r.get('calls', 0) or 0),
            })

    top_models = []
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': ws_id, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$model',
            'cost_usd': {'$sum': '$cost_usd'},
            'calls':    {'$sum': 1},
        }},
        {'$sort': {'cost_usd': -1}},
        {'$limit': 8},
    ]):
        top_models.append({
            'model': row['_id'],
            'cost_usd': round(float(row.get('cost_usd', 0) or 0), 4),
            'calls': int(row.get('calls', 0) or 0),
        })

    by_role = {'admin': {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0},
               'manager': {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0},
               'user':    {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0}}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': ws_id, 'created_at': {'$gte': cutoff}}},
        {'$lookup': {'from': 'users', 'localField': 'user_id', 'foreignField': '_id', 'as': 'u'}},
        {'$unwind': {'path': '$u', 'preserveNullAndEmptyArrays': True}},
        {'$group': {
            '_id': {'role': '$u.role', 'user_id': '$user_id'},
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
        {'$group': {
            '_id': '$_id.role',
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': '$tokens'},
            'calls':    {'$sum': '$calls'},
            'users':    {'$sum': 1},
        }},
    ]):
        role = (row.get('_id') or 'user').lower()
        if role not in by_role:
            role = 'user'
        by_role[role] = {
            'cost_usd': round(float(row.get('cost_usd', 0) or 0), 4),
            'tokens':   int(row.get('tokens', 0) or 0),
            'calls':    int(row.get('calls', 0) or 0),
            'users':    int(row.get('users', 0) or 0),
        }

    daily_raw = {}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': ws_id, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}},
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
    ]):
        daily_raw[row['_id']] = row
    daily = []
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=days - i - 1)).strftime('%Y-%m-%d')
        r = daily_raw.get(d, {})
        daily.append({
            'date': d,
            'cost_usd': round(float(r.get('cost_usd', 0) or 0), 4),
            'tokens':   int(r.get('tokens', 0) or 0),
            'calls':    int(r.get('calls', 0) or 0),
        })

    lifetime_topups = float(CreditLedgerModel.sum_credits(ws_id))
    lifetime_spend_rows = list(mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': ws_id}},
        {'$group': {'_id': None, 'total': {'$sum': '$cost_usd'}}},
    ]))
    lifetime_spend = float(lifetime_spend_rows[0]['total']) if lifetime_spend_rows else 0.0
    credits_block = {
        'lifetime_topups_usd': round(lifetime_topups, 4),
        'lifetime_spend_usd':  round(lifetime_spend, 4),
        'remaining_usd':       round(lifetime_topups - lifetime_spend, 4),
        'balance_field':       float(workspace.get('credits_balance_usd') or 0),
    }

    recent_rows = CreditLedgerModel.find_by_workspace(ws_id, limit=5)
    uid_objs = [r['added_by'] for r in recent_rows if r.get('added_by') is not None]
    user_map = {}
    if uid_objs:
        for u in mongo.db.users.find({'_id': {'$in': uid_objs}}, {'email': 1, 'profile.display_name': 1}):
            user_map[u['_id']] = {
                'email': u.get('email'),
                'display_name': (u.get('profile') or {}).get('display_name'),
            }
    recent_ledger = []
    for r in recent_rows:
        info = user_map.get(r.get('added_by'), {}) or {}
        recent_ledger.append({
            '_id': str(r['_id']),
            'amount_usd': float(r.get('amount_usd') or 0),
            'type': r.get('type'),
            'note': r.get('note') or '',
            'created_at': r.get('created_at'),
            'added_by': {
                'id': str(r['added_by']) if r.get('added_by') else None,
                'email': info.get('email'),
                'display_name': info.get('display_name'),
            },
        })

    member_count = mongo.db.workspace_members.count_documents({'workspace_id': ws_id, 'status': 'active'})

    return {
        'workspace': serialize_doc(workspace),
        'days': days,
        'member_count': member_count,
        'project_count': len([p for p in projects if not p.get('archived')]),
        'projects': project_rows,
        'top_users': top_users,
        'top_models': top_models,
        'by_role': by_role,
        'daily': daily,
        'credits': credits_block,
        'recent_ledger': serialize_doc(recent_ledger),
    }


def users_overview(days: int = 30, page: int = 1, limit: int = 50,
                   search: str = '', role: str = '') -> dict:
    """Holding-wide per-user usage rollup. Raises ``ValueError`` for bad role."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    page = max(1, int(page))
    limit = max(1, min(200, int(limit)))
    skip = (page - 1) * limit

    user_query = {}
    role = (role or '').strip().lower() or None
    if role:
        if role not in VALID_USER_ROLES:
            raise ValueError(f"role must be one of {sorted(VALID_USER_ROLES)}")
        user_query['role'] = role
    search = (search or '').strip()
    if search:
        esc = re.escape(search)
        user_query['$or'] = [
            {'email': {'$regex': esc, '$options': 'i'}},
            {'profile.display_name': {'$regex': esc, '$options': 'i'}},
        ]

    matched_user_ids = [u['_id'] for u in mongo.db.users.find(user_query, {'_id': 1})]
    if not matched_user_ids:
        return {
            'users': [], 'total': 0, 'page': page, 'limit': limit, 'days': days,
            'totals': {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0},
        }

    usage_by_uid = {}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'user_id': {'$in': matched_user_ids}, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$user_id',
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
    ]):
        usage_by_uid[row['_id']] = row

    ws_counts = {}
    for row in mongo.db.workspace_members.aggregate([
        {'$match': {'user_id': {'$in': matched_user_ids}, 'status': 'active'}},
        {'$group': {'_id': '$user_id', 'count': {'$sum': 1}}},
    ]):
        ws_counts[row['_id']] = row['count']

    users_full = list(mongo.db.users.find(
        {'_id': {'$in': matched_user_ids}},
        {'email': 1, 'role': 1, 'profile.display_name': 1, 'usage.last_active': 1, 'created_at': 1, 'status.is_banned': 1},
    ))

    rows = []
    for u in users_full:
        usage = usage_by_uid.get(u['_id'], {})
        rows.append({
            '_id': str(u['_id']),
            'email': u.get('email'),
            'display_name': (u.get('profile') or {}).get('display_name'),
            'role': u.get('role') or 'user',
            'is_banned': bool((u.get('status') or {}).get('is_banned')),
            'last_active': (u.get('usage') or {}).get('last_active'),
            'created_at': u.get('created_at'),
            'workspaces_count': ws_counts.get(u['_id'], 0),
            'cost_usd': round(float(usage.get('cost_usd', 0) or 0), 4),
            'tokens':   int(usage.get('tokens', 0) or 0),
            'calls':    int(usage.get('calls', 0) or 0),
        })

    rows.sort(key=lambda r: r['cost_usd'], reverse=True)
    total = len(rows)
    page_rows = rows[skip:skip + limit]

    totals = {
        'users': total,
        'cost_usd': round(sum(r['cost_usd'] for r in rows), 4),
        'tokens':   sum(r['tokens'] for r in rows),
        'calls':    sum(r['calls'] for r in rows),
    }

    return {
        'users': serialize_doc(page_rows),
        'total': total,
        'page': page,
        'limit': limit,
        'days': days,
        'totals': totals,
    }


def holding_overview(days: int = 30) -> dict:
    """Holding-wide rollup: counts + per-window cost/calls/tokens, daily series, top companies/models, holding-credits."""
    from app.models.platform_settings import PlatformSettingsModel

    cutoff = datetime.utcnow() - timedelta(days=days)

    workspaces_count = mongo.db.workspaces.count_documents({})
    projects_count = mongo.db.projects.count_documents({})
    users_count = mongo.db.users.count_documents({})
    conversations_count = mongo.db.conversations.count_documents({})

    ceo = None
    ceo_doc = mongo.db.users.find_one(
        {'role': 'admin'},
        {'email': 1, 'profile.display_name': 1, 'created_at': 1},
        sort=[('created_at', 1)],
    )
    if ceo_doc:
        ceo = {
            'email': ceo_doc.get('email'),
            'display_name': (ceo_doc.get('profile') or {}).get('display_name'),
        }

    totals_row = next(iter(mongo.db.usage_logs.aggregate([
        {'$match': {'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': None,
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
    ])), None)
    totals = {
        'cost_usd': round(float((totals_row or {}).get('cost_usd', 0) or 0), 4),
        'tokens':   int((totals_row or {}).get('tokens', 0) or 0),
        'calls':    int((totals_row or {}).get('calls', 0) or 0),
    }

    daily_raw = {}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': {'$dateToString': {'format': '%Y-%m-%d', 'date': '$created_at'}},
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
    ]):
        daily_raw[row['_id']] = row
    daily = []
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=days - i - 1)).strftime('%Y-%m-%d')
        r = daily_raw.get(d, {})
        daily.append({
            'date': d,
            'cost_usd': round(float(r.get('cost_usd', 0) or 0), 4),
            'tokens':   int(r.get('tokens', 0) or 0),
            'calls':    int(r.get('calls', 0) or 0),
        })

    top_companies = []
    company_rollup = list(mongo.db.usage_logs.aggregate([
        {'$match': {'workspace_id': {'$ne': None}, 'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$workspace_id',
            'cost_usd': {'$sum': '$cost_usd'},
            'calls':    {'$sum': 1},
        }},
        {'$sort': {'cost_usd': -1}},
        {'$limit': 8},
    ]))
    if company_rollup:
        wids = [r['_id'] for r in company_rollup if r.get('_id')]
        ws_map = {w['_id']: w for w in mongo.db.workspaces.find(
            {'_id': {'$in': wids}}, {'name': 1, 'slug': 1, 'domain': 1},
        )}
        for r in company_rollup:
            w = ws_map.get(r['_id'], {})
            top_companies.append({
                '_id': str(r['_id']),
                'name': w.get('name') or '—',
                'domain': w.get('domain') or w.get('slug'),
                'cost_usd': round(float(r.get('cost_usd', 0) or 0), 4),
                'calls': int(r.get('calls', 0) or 0),
            })

    top_models = []
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'created_at': {'$gte': cutoff}}},
        {'$group': {
            '_id': '$model',
            'cost_usd': {'$sum': '$cost_usd'},
            'calls':    {'$sum': 1},
        }},
        {'$sort': {'cost_usd': -1}},
        {'$limit': 8},
    ]):
        top_models.append({
            'model': row['_id'],
            'cost_usd': round(float(row.get('cost_usd', 0) or 0), 4),
            'calls': int(row.get('calls', 0) or 0),
        })

    by_role_doc = {'admin': {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0},
                   'manager': {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0},
                   'user':    {'cost_usd': 0.0, 'tokens': 0, 'calls': 0, 'users': 0}}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {'created_at': {'$gte': cutoff}}},
        {'$lookup': {'from': 'users', 'localField': 'user_id', 'foreignField': '_id', 'as': 'u'}},
        {'$unwind': {'path': '$u', 'preserveNullAndEmptyArrays': True}},
        {'$group': {
            '_id': {'role': '$u.role', 'user_id': '$user_id'},
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': {'$add': ['$prompt_tokens', '$completion_tokens']}},
            'calls':    {'$sum': 1},
        }},
        {'$group': {
            '_id': '$_id.role',
            'cost_usd': {'$sum': '$cost_usd'},
            'tokens':   {'$sum': '$tokens'},
            'calls':    {'$sum': '$calls'},
            'users':    {'$sum': 1},
        }},
    ]):
        role = (row.get('_id') or 'user').lower()
        if role not in by_role_doc:
            role = 'user'
        by_role_doc[role] = {
            'cost_usd': round(float(row.get('cost_usd', 0) or 0), 4),
            'tokens':   int(row.get('tokens', 0) or 0),
            'calls':    int(row.get('calls', 0) or 0),
            'users':    int(row.get('users', 0) or 0),
        }

    settings_doc = PlatformSettingsModel.get()
    holding_topups = float((settings_doc or {}).get('holding_credits_topups_usd') or 0)
    holding_spend_rows = list(mongo.db.usage_logs.aggregate([
        {'$group': {'_id': None, 'total': {'$sum': '$cost_usd'}}},
    ]))
    holding_lifetime_spend = float(holding_spend_rows[0]['total']) if holding_spend_rows else 0.0
    holding_credits = {
        'lifetime_topups_usd': round(holding_topups, 4),
        'lifetime_spend_usd':  round(holding_lifetime_spend, 4),
        'remaining_usd':       round(holding_topups - holding_lifetime_spend, 4),
    }

    return {
        'workspaces_count': workspaces_count,
        'projects_count': projects_count,
        'users_count': users_count,
        'conversations_count': conversations_count,
        'ceo': ceo,
        'days': days,
        'totals': totals,
        'daily': daily,
        'top_companies': top_companies,
        'top_models': top_models,
        'by_role': by_role_doc,
        'holding_credits': holding_credits,
    }


# ---------------------------------------------------------------------------
# Holding-credit ledger (P2.32)
# ---------------------------------------------------------------------------

def holding_ledger(skip: int = 0, limit: int = 50) -> dict:
    """Return paginated `holding_credits_added` audit rows with admin metadata
    hydrated. This is the single mongo touchpoint for the holding ledger so
    routes never hand-roll the aggregation (CLAUDE.md rule).
    """
    skip = max(0, int(skip))
    limit = max(1, min(200, int(limit)))

    cursor = mongo.db.platform_audit_logs.find(
        {'action': 'holding_credits_added'},
    ).sort('created_at', -1).skip(skip).limit(limit)
    rows = list(cursor)

    pa_ids = list({r.get('platform_admin_id') for r in rows if r.get('platform_admin_id') is not None})
    pa_map: dict = {}
    if pa_ids:
        for pa in mongo.db.platform_admins.find(
            {'_id': {'$in': pa_ids}}, {'email': 1, 'display_name': 1},
        ):
            pa_map[pa['_id']] = {'email': pa.get('email'), 'display_name': pa.get('display_name')}

    entries = []
    for r in rows:
        pa_info = pa_map.get(r.get('platform_admin_id'), {}) or {}
        details = r.get('details') or {}
        entries.append({
            '_id': str(r['_id']),
            'created_at': r.get('created_at'),
            'amount_usd': float(details.get('amount_usd') or 0),
            'type': details.get('type'),
            'note': details.get('note') or '',
            'added_by': {
                'id': str(r['platform_admin_id']) if r.get('platform_admin_id') else None,
                'email': pa_info.get('email'),
                'display_name': pa_info.get('display_name'),
            },
        })

    total = mongo.db.platform_audit_logs.count_documents({'action': 'holding_credits_added'})
    return {
        'entries': serialize_doc(entries),
        'total': total,
        'skip': skip,
        'limit': limit,
    }
