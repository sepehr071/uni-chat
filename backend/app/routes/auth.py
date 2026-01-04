from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt, get_current_user
)
from app.models.user import UserModel
from app.extensions import mongo
from app.utils.validators import validate_email_address, validate_password, validate_display_name
from app.utils.helpers import serialize_doc
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = data.get('email', '').strip()
    password = data.get('password', '')
    display_name = data.get('display_name', '').strip()

    # Validate email
    validated_email = validate_email_address(email)
    if not validated_email:
        return jsonify({'error': 'Invalid email address'}), 400

    # Validate password
    is_valid, error = validate_password(password)
    if not is_valid:
        return jsonify({'error': error}), 400

    # Validate display name
    is_valid, error = validate_display_name(display_name)
    if not is_valid:
        return jsonify({'error': error}), 400

    # Check if email already exists
    existing_user = UserModel.find_by_email(validated_email)
    if existing_user:
        return jsonify({'error': 'Email already registered'}), 409

    # Create user
    try:
        user = UserModel.create(
            email=validated_email,
            password=password,
            display_name=display_name
        )

        # Don't return password hash
        user_response = {
            'id': str(user['_id']),
            'email': user['email'],
            'display_name': user['profile']['display_name'],
            'role': user['role']
        }

        return jsonify({
            'message': 'Registration successful',
            'user': user_response
        }), 201

    except Exception as e:
        return jsonify({'error': 'Failed to create user'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Login user and return tokens"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Find user
    user = UserModel.find_by_email(email)
    if not user:
        return jsonify({'error': 'Invalid email or password'}), 401

    # Verify password
    if not UserModel.verify_password(user, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    # Check if banned
    if user.get('status', {}).get('is_banned', False):
        return jsonify({
            'error': 'Account has been suspended',
            'reason': user.get('status', {}).get('ban_reason', 'No reason provided')
        }), 403

    # Create tokens
    user_id = str(user['_id'])
    access_token = create_access_token(identity=user_id)
    refresh_token = create_refresh_token(identity=user_id)

    # Update last active
    UserModel.update_last_active(user_id)

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'Bearer',
        'expires_in': 900,  # 15 minutes
        'user': {
            'id': user_id,
            'email': user['email'],
            'display_name': user['profile']['display_name'],
            'role': user['role'],
            'avatar_url': user['profile'].get('avatar_url')
        }
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    identity = get_jwt_identity()
    access_token = create_access_token(identity=identity)

    return jsonify({
        'access_token': access_token,
        'token_type': 'Bearer',
        'expires_in': 900
    }), 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout user - revoke token"""
    jti = get_jwt()['jti']

    # Add token to blocklist
    mongo.db.revoked_tokens.insert_one({
        'jti': jti,
        'created_at': datetime.utcnow()
    })

    return jsonify({'message': 'Successfully logged out'}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user_info():
    """Get current user information"""
    user = get_current_user()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'id': str(user['_id']),
        'email': user['email'],
        'role': user['role'],
        'profile': {
            'display_name': user['profile']['display_name'],
            'avatar_url': user['profile'].get('avatar_url'),
            'bio': user['profile'].get('bio', '')
        },
        'settings': user.get('settings', {}),
        'usage': {
            'messages_sent': user['usage']['messages_sent'],
            'tokens_used': user['usage']['tokens_used'],
            'tokens_limit': user['usage']['tokens_limit']
        },
        'created_at': user['created_at'].isoformat()
    }), 200


@auth_bp.route('/password', methods=['PUT'])
@jwt_required()
def change_password():
    """Change user password"""
    user = get_current_user()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({'error': 'Current and new password are required'}), 400

    # Verify current password
    if not UserModel.verify_password(user, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401

    # Validate new password
    is_valid, error = validate_password(new_password)
    if not is_valid:
        return jsonify({'error': error}), 400

    # Update password
    import bcrypt
    new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
    UserModel.update(user['_id'], {'password_hash': new_hash})

    return jsonify({'message': 'Password updated successfully'}), 200
