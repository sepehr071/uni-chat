import os
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.utils.decorators import active_user_required
from app.models.user import UserModel
from app.models.telegram_link_token import TelegramLinkTokenModel

telegram_link_bp = Blueprint('telegram_link', __name__)


@telegram_link_bp.route('/status', methods=['GET'])
@jwt_required()
@active_user_required
def status():
    user = get_current_user()
    return jsonify({
        'linked': user.get('telegram_id') is not None,
        'telegram_username': user.get('telegram_username'),
    }), 200


@telegram_link_bp.route('/generate-token', methods=['POST'])
@jwt_required()
@active_user_required
def generate_token():
    user = get_current_user()
    bot_username = os.environ.get('TELEGRAM_BOT_USERNAME', 'unichat_ai_bot')
    token = TelegramLinkTokenModel.create(str(user['_id']))
    return jsonify({
        'link_url': f'https://t.me/{bot_username}?start={token}',
        'expires_in_seconds': 600,
    }), 200


@telegram_link_bp.route('/unlink', methods=['DELETE'])
@jwt_required()
@active_user_required
def unlink():
    user = get_current_user()
    UserModel.clear_telegram_link(str(user['_id']))
    return jsonify({'unlinked': True}), 200
