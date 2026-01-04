from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from bson import ObjectId
from datetime import datetime, timedelta
from app.models.user import UserModel
from app.models.conversation import ConversationModel
from app.models.message import MessageModel
from app.models.llm_config import LLMConfigModel
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
    skip = (page - 1) * limit

    # Build query
    query = {}
    if not include_banned:
        query['status.is_banned'] = False
    if search:
        query['$or'] = [
            {'email': {'$regex': search, '$options': 'i'}},
            {'profile.display_name': {'$regex': search, '$options': 'i'}}
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


@admin_bp.route('/users/<user_id>/ban', methods=['PUT'])
@jwt_required()
@admin_required
def ban_user(user_id):
    """Ban a user"""
    admin = get_current_user()
    data = request.get_json()

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
    data = request.get_json()

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
    data = request.get_json()

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

    data = request.get_json()
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
    except:
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
    except:
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
    except:
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
