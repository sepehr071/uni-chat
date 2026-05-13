from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from datetime import datetime, timedelta
import re
from app.models.user import UserModel, VALID_USER_ROLES
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.llm_config import LLMConfigModel
from app.models.audit_log import AuditLogModel
from app.extensions import mongo
from app.utils.helpers import serialize_doc
from app.utils.decorators import admin_required

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@admin_required
def get_users():
    """Get all users"""
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    include_banned = request.args.get('include_banned', 'true').lower() == 'true'
    search = request.args.get('search', '').strip()
    role_filter = request.args.get('role', '').strip().lower() or None
    skip = (page - 1) * limit

    # Build query
    query = {}
    if not include_banned:
        query['status.is_banned'] = False
    if role_filter:
        query['role'] = role_filter
    if search:
        # Escape regex special characters to prevent injection
        escaped_search = re.escape(search)
        query['$or'] = [
            {'email': {'$regex': escaped_search, '$options': 'i'}},
            {'profile.display_name': {'$regex': escaped_search, '$options': 'i'}}
        ]

    users = list(mongo.db.users.find(
        query,
        {'password_hash': 0}
    ).sort('created_at', -1).skip(skip).limit(limit))

    total = mongo.db.users.count_documents(query)

    return jsonify({
        'users': serialize_doc(users),
        'total': total,
        'page': page,
        'limit': limit,
        'has_more': skip + len(users) < total
    }), 200


@admin_bp.route('/users/<user_id>', methods=['GET'])
@jwt_required()
@admin_required
def get_user(user_id):
    """Get detailed user info"""
    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Remove password hash
    user_data = serialize_doc(user)
    if 'password_hash' in user_data:
        del user_data['password_hash']

    # Get additional stats
    conversation_count = ConversationModel.count_by_user(user_id)
    config_count = LLMConfigModel.count_by_owner(user_id)

    user_data['stats'] = {
        'conversation_count': conversation_count,
        'config_count': config_count
    }

    return jsonify({
        'user': user_data
    }), 200


@admin_bp.route('/users/<user_id>', methods=['PATCH'])
@jwt_required()
@admin_required
def update_user(user_id):
    """Update a user's role (and other non-sensitive fields)."""
    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    update_fields = {}

    if 'role' in data:
        role = (data['role'] or '').strip().lower()
        if role not in VALID_USER_ROLES:
            return jsonify({'error': f"role must be one of {sorted(VALID_USER_ROLES)}"}), 400
        update_fields['role'] = role

    if not update_fields:
        return jsonify({'error': 'No valid fields to update'}), 400

    UserModel.update(user_id, update_fields)
    updated = UserModel.find_by_id(user_id)
    updated_data = serialize_doc(updated)
    updated_data.pop('password_hash', None)
    return jsonify({'user': updated_data}), 200


@admin_bp.route('/users/<user_id>/ban', methods=['PUT'])
@jwt_required()
@admin_required
def ban_user(user_id):
    """Ban a user"""
    admin = get_current_user()
    data = request.get_json(silent=True) or {}

    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Prevent self-ban
    if str(user['_id']) == str(admin['_id']):
        return jsonify({'error': 'Cannot ban yourself'}), 400

    # Prevent banning other admins
    if user.get('role') == 'admin':
        return jsonify({'error': 'Cannot ban admin users'}), 400

    reason = data.get('reason', 'No reason provided')
    UserModel.ban_user(user_id, reason, str(admin['_id']))

    return jsonify({
        'message': 'User banned',
        'user_id': user_id,
        'reason': reason
    }), 200


@admin_bp.route('/users/<user_id>/unban', methods=['PUT'])
@jwt_required()
@admin_required
def unban_user(user_id):
    """Unban a user"""
    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    UserModel.unban_user(user_id)

    return jsonify({
        'message': 'User unbanned',
        'user_id': user_id
    }), 200


@admin_bp.route('/users/<user_id>/limits', methods=['PUT'])
@jwt_required()
@admin_required
def set_user_limits(user_id):
    """Set usage limits for a user"""
    data = request.get_json(silent=True) or {}

    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    tokens_limit = data.get('tokens_limit', -1)  # -1 = unlimited
    UserModel.update(user_id, {'usage.tokens_limit': tokens_limit})

    return jsonify({
        'message': 'User limits updated',
        'user_id': user_id,
        'tokens_limit': tokens_limit
    }), 200


@admin_bp.route('/users/<user_id>/history', methods=['GET'])
@jwt_required()
@admin_required
def get_user_history(user_id):
    """Get user's chat history"""
    user = UserModel.find_by_id(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    skip = (page - 1) * limit

    conversations = ConversationModel.get_by_user_for_admin(user_id, skip=skip, limit=limit)

    # Get messages for each conversation if requested
    include_messages = request.args.get('include_messages', 'false').lower() == 'true'
    if include_messages:
        for conv in conversations:
            messages = MessageModel.find_by_conversation(str(conv['_id']), limit=50)
            conv['messages'] = messages

    return jsonify({
        'conversations': serialize_doc(conversations),
        'user': {
            'id': str(user['_id']),
            'email': user['email'],
            'display_name': user['profile']['display_name']
        }
    }), 200


@admin_bp.route('/templates', methods=['GET'])
@jwt_required()
@admin_required
def get_templates():
    """Get all templates"""
    templates = LLMConfigModel.find_templates()
    return jsonify({
        'templates': serialize_doc(templates)
    }), 200


@admin_bp.route('/templates', methods=['POST'])
@jwt_required()
@admin_required
def create_template():
    """Create a new template"""
    data = request.get_json(silent=True) or {}

    name = data.get('name', '').strip()
    model_id = data.get('model_id')

    if not name or not model_id:
        return jsonify({'error': 'Name and model_id are required'}), 400

    template = LLMConfigModel.create(
        name=name,
        model_id=model_id,
        model_name=data.get('model_name', model_id),
        owner_id=None,  # Templates have no owner
        description=data.get('description', ''),
        system_prompt=data.get('system_prompt', ''),
        visibility='template',
        avatar=data.get('avatar'),
        parameters=data.get('parameters'),
        tags=data.get('tags', [])
    )

    return jsonify({
        'template': serialize_doc(template)
    }), 201


@admin_bp.route('/templates/<template_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_template(template_id):
    """Update a template"""
    template = LLMConfigModel.find_by_id(template_id)
    if not template or template['visibility'] != 'template':
        return jsonify({'error': 'Template not found'}), 404

    data = request.get_json(silent=True) or {}
    update_fields = {}

    for field in ['name', 'description', 'system_prompt', 'model_id', 'model_name', 'avatar', 'parameters', 'tags']:
        if field in data:
            update_fields[field] = data[field]

    if update_fields:
        LLMConfigModel.update(template_id, update_fields)

    updated = LLMConfigModel.find_by_id(template_id)
    return jsonify({
        'template': serialize_doc(updated)
    }), 200


@admin_bp.route('/templates/<template_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_template(template_id):
    """Delete a template"""
    template = LLMConfigModel.find_by_id(template_id)
    if not template or template['visibility'] != 'template':
        return jsonify({'error': 'Template not found'}), 404

    LLMConfigModel.delete(template_id)

    return jsonify({'message': 'Template deleted'}), 200


@admin_bp.route('/analytics', methods=['GET'])
@jwt_required()
@admin_required
def get_analytics():
    """Get usage analytics"""
    # Time range
    days = int(request.args.get('days', 30))
    start_date = datetime.utcnow() - timedelta(days=days)

    # Total users
    total_users = UserModel.count()
    active_users = mongo.db.users.count_documents({
        'usage.last_active': {'$gte': start_date}
    })

    # Total conversations and messages
    total_conversations = mongo.db.conversations.count_documents({})
    recent_conversations = mongo.db.conversations.count_documents({
        'created_at': {'$gte': start_date}
    })

    total_messages = mongo.db.messages.count_documents({})

    # Total tokens used
    pipeline = [
        {'$group': {
            '_id': None,
            'total_tokens': {'$sum': '$usage.tokens_used'}
        }}
    ]
    result = list(mongo.db.users.aggregate(pipeline))
    total_tokens = result[0]['total_tokens'] if result else 0

    # Usage by model (from usage_logs if available)
    model_usage = []
    try:
        model_pipeline = [
            {'$match': {'created_at': {'$gte': start_date}}},
            {'$group': {
                '_id': '$model_id',
                'count': {'$sum': 1},
                'total_tokens': {'$sum': '$tokens.total'}
            }},
            {'$sort': {'count': -1}},
            {'$limit': 10}
        ]
        model_usage = list(mongo.db.usage_logs.aggregate(model_pipeline))
    except Exception:
        pass

    return jsonify({
        'analytics': {
            'users': {
                'total': total_users,
                'active': active_users
            },
            'conversations': {
                'total': total_conversations,
                'recent': recent_conversations
            },
            'messages': {
                'total': total_messages
            },
            'tokens': {
                'total': total_tokens
            },
            'model_usage': model_usage,
            'period_days': days
        }
    }), 200


@admin_bp.route('/analytics/costs', methods=['GET'])
@jwt_required()
@admin_required
def get_cost_analytics():
    """Get API cost breakdown"""
    days = int(request.args.get('days', 30))
    start_date = datetime.utcnow() - timedelta(days=days)

    # Try to get costs from usage_logs
    try:
        pipeline = [
            {'$match': {'created_at': {'$gte': start_date}}},
            {'$group': {
                '_id': '$model_id',
                'total_cost': {'$sum': '$cost_usd'},
                'total_requests': {'$sum': 1},
                'total_tokens': {'$sum': '$tokens.total'}
            }},
            {'$sort': {'total_cost': -1}}
        ]
        costs = list(mongo.db.usage_logs.aggregate(pipeline))

        total_cost = sum(c['total_cost'] for c in costs)

        return jsonify({
            'costs': {
                'by_model': costs,
                'total_cost_usd': total_cost,
                'period_days': days
            }
        }), 200
    except Exception as e:
        return jsonify({
            'costs': {
                'by_model': [],
                'total_cost_usd': 0,
                'period_days': days,
                'note': 'Cost tracking not yet implemented'
            }
        }), 200


@admin_bp.route('/analytics/timeseries', methods=['GET'])
@jwt_required()
@admin_required
def get_timeseries_analytics():
    """Get time-series analytics data for charts"""
    days = int(request.args.get('days', 30))
    granularity = request.args.get('granularity', 'day')  # day, week, month
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get messages per day
    messages_pipeline = [
        {'$match': {'created_at': {'$gte': start_date}}},
        {'$group': {
            '_id': {
                '$dateToString': {
                    'format': '%Y-%m-%d',
                    'date': '$created_at'
                }
            },
            'count': {'$sum': 1}
        }},
        {'$sort': {'_id': 1}}
    ]
    messages_by_day = list(mongo.db.messages.aggregate(messages_pipeline))

    # Get users per day (registrations)
    users_pipeline = [
        {'$match': {'created_at': {'$gte': start_date}}},
        {'$group': {
            '_id': {
                '$dateToString': {
                    'format': '%Y-%m-%d',
                    'date': '$created_at'
                }
            },
            'count': {'$sum': 1}
        }},
        {'$sort': {'_id': 1}}
    ]
    users_by_day = list(mongo.db.users.aggregate(users_pipeline))

    # Get conversations per day
    conversations_pipeline = [
        {'$match': {'created_at': {'$gte': start_date}}},
        {'$group': {
            '_id': {
                '$dateToString': {
                    'format': '%Y-%m-%d',
                    'date': '$created_at'
                }
            },
            'count': {'$sum': 1}
        }},
        {'$sort': {'_id': 1}}
    ]
    conversations_by_day = list(mongo.db.conversations.aggregate(conversations_pipeline))

    # Get tokens per day from usage_logs (if available)
    tokens_by_day = []
    try:
        tokens_pipeline = [
            {'$match': {'created_at': {'$gte': start_date}}},
            {'$group': {
                '_id': {
                    '$dateToString': {
                        'format': '%Y-%m-%d',
                        'date': '$created_at'
                    }
                },
                'tokens': {'$sum': {'$add': ['$tokens.prompt', '$tokens.completion']}}
            }},
            {'$sort': {'_id': 1}}
        ]
        tokens_by_day = list(mongo.db.usage_logs.aggregate(tokens_pipeline))
    except Exception:
        pass

    # Get popular models
    popular_models = []
    try:
        model_pipeline = [
            {'$match': {'created_at': {'$gte': start_date}, 'metadata.model_id': {'$exists': True}}},
            {'$group': {
                '_id': '$metadata.model_id',
                'count': {'$sum': 1}
            }},
            {'$sort': {'count': -1}},
            {'$limit': 5}
        ]
        popular_models = list(mongo.db.messages.aggregate(model_pipeline))
    except Exception:
        pass

    # Fill in missing days with zero values
    def fill_dates(data, days):
        date_map = {item['_id']: item['count'] for item in data}
        filled = []
        for i in range(days):
            date = (datetime.utcnow() - timedelta(days=days-i-1)).strftime('%Y-%m-%d')
            filled.append({
                'date': date,
                'value': date_map.get(date, 0)
            })
        return filled

    return jsonify({
        'timeseries': {
            'messages': fill_dates(messages_by_day, days),
            'users': fill_dates(users_by_day, days),
            'conversations': fill_dates(conversations_by_day, days),
            'tokens': [{'date': t['_id'], 'value': t.get('tokens', 0)} for t in tokens_by_day],
            'popular_models': [{'model': m['_id'], 'count': m['count']} for m in popular_models],
            'period_days': days,
            'granularity': granularity
        }
    }), 200


@admin_bp.route('/audit-logs', methods=['GET'])
@jwt_required()
@admin_required
def get_audit_logs():
    """Get audit logs with filtering and pagination"""
    skip = int(request.args.get('skip', 0))
    limit = int(request.args.get('limit', 50))
    action = request.args.get('action')

    # Build query
    query = {}
    if action:
        query['action'] = action

    logs = list(mongo.db.audit_logs.find(query)
                .sort('created_at', -1)
                .skip(skip)
                .limit(limit))

    # Get admin emails for display
    admin_ids = list(set(str(log.get('admin_id')) for log in logs if log.get('admin_id')))
    admin_map = {}
    if admin_ids:
        admins = list(mongo.db.users.find(
            {'_id': {'$in': [ObjectId(aid) for aid in admin_ids if ObjectId.is_valid(aid)]}},
            {'email': 1}
        ))
        admin_map = {str(a['_id']): a['email'] for a in admins}

    # Add admin email to logs
    for log in logs:
        admin_id = str(log.get('admin_id', ''))
        log['admin_email'] = admin_map.get(admin_id, 'Unknown')

    total = mongo.db.audit_logs.count_documents(query)

    return jsonify({
        'logs': serialize_doc(logs),
        'total': total,
        'skip': skip,
        'limit': limit
    }), 200


# ----------------------------------------------------------------------------
# Cross-company analytics — super-admin holding view
# ----------------------------------------------------------------------------

@admin_bp.route('/companies', methods=['GET'])
@jwt_required()
@admin_required
def list_all_companies():
    """List every team workspace with aggregated stats. Super-admin only."""
    days = int(request.args.get('days', 30))
    cutoff = datetime.utcnow() - timedelta(days=days)

    workspaces = list(mongo.db.workspaces.find({'type': 'team'}).sort('created_at', -1))
    if not workspaces:
        return jsonify({'companies': [], 'totals': _empty_totals()}), 200

    wids = [w['_id'] for w in workspaces]

    # Member counts
    member_counts = {}
    for row in mongo.db.workspace_members.aggregate([
        {'$match': {'workspace_id': {'$in': wids}, 'status': 'active'}},
        {'$group': {'_id': '$workspace_id', 'count': {'$sum': 1}}},
    ]):
        member_counts[row['_id']] = row['count']

    # Project counts (active only)
    project_counts = {}
    for row in mongo.db.projects.aggregate([
        {'$match': {'workspace_id': {'$in': wids}, 'archived': {'$ne': True}}},
        {'$group': {'_id': '$workspace_id', 'count': {'$sum': 1}}},
    ]):
        project_counts[row['_id']] = row['count']

    # Conversation counts
    conv_counts = {}
    for row in mongo.db.conversations.aggregate([
        {'$lookup': {'from': 'projects', 'localField': 'project_id', 'foreignField': '_id', 'as': 'p'}},
        {'$unwind': {'path': '$p', 'preserveNullAndEmptyArrays': False}},
        {'$match': {'p.workspace_id': {'$in': wids}}},
        {'$group': {'_id': '$p.workspace_id', 'count': {'$sum': 1}}},
    ]):
        conv_counts[row['_id']] = row['count']

    # Usage rollup over last `days` days: cost + tokens + call count
    usage = {}
    for row in mongo.db.usage_logs.aggregate([
        {'$match': {
            'workspace_id': {'$in': wids},
            'created_at': {'$gte': cutoff},
        }},
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

    return jsonify({'companies': serialize_doc(out), 'totals': totals, 'days': days}), 200


def _empty_totals():
    return {
        'companies': 0, 'members': 0, 'projects': 0, 'conversations': 0,
        'cost_30d': 0.0, 'tokens_30d': 0, 'calls_30d': 0, 'credits_balance_usd': 0.0,
    }


@admin_bp.route('/companies/<wid>', methods=['GET'])
@jwt_required()
@admin_required
def get_company_detail(wid):
    """Drill-down stats for one company. Super-admin only."""
    if not ObjectId.is_valid(wid):
        return jsonify({'error': 'invalid id'}), 400

    days = int(request.args.get('days', 30))
    cutoff = datetime.utcnow() - timedelta(days=days)
    ws_id = ObjectId(wid)

    workspace = mongo.db.workspaces.find_one({'_id': ws_id})
    if not workspace:
        return jsonify({'error': 'not found'}), 404

    # Per-project breakdown
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

    # Top users
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
        users = {u['_id']: u for u in mongo.db.users.find({'_id': {'$in': uids}}, {'email': 1, 'profile.display_name': 1, 'role': 1})}
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

    # Top models
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

    member_count = mongo.db.workspace_members.count_documents({'workspace_id': ws_id, 'status': 'active'})

    return jsonify({
        'workspace': serialize_doc(workspace),
        'days': days,
        'member_count': member_count,
        'project_count': len([p for p in projects if not p.get('archived')]),
        'projects': project_rows,
        'top_users': top_users,
        'top_models': top_models,
    }), 200



@admin_bp.route('/users-overview', methods=['GET'])
@jwt_required()
@admin_required
def users_overview():
    """Cross-company users overview. Super-admin (user.role='admin') only.

    Thin wrapper around `holding_analytics.users_overview` — same payload as the
    platform-admin endpoint at `/api/platform/users-overview`, but gated by the
    in-app super-admin role rather than the platform_admin claim.
    """
    from app.services import holding_analytics
    try:
        payload = holding_analytics.users_overview(
            days=int(request.args.get('days', 30)),
            page=int(request.args.get('page', 1)),
            limit=int(request.args.get('limit', 50)),
            search=request.args.get('search', ''),
            role=request.args.get('role', ''),
        )
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    return jsonify(payload), 200
