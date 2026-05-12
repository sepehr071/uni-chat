from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt, get_current_user,
    decode_token,
)
from app.models.user import UserModel
from app.extensions import mongo
from app.utils.validators import validate_email_address, validate_password, validate_display_name
from app.utils.helpers import serialize_doc
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json(silent=True) or {}

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

    # Cross-collection email uniqueness — platform admins live in a separate
    # collection but must not collide with regular user emails.
    try:
        from app.models.platform_admin import PlatformAdminModel
        if PlatformAdminModel.find_by_email(validated_email):
            return jsonify({'error': 'Email already registered'}), 409
    except ImportError:
        pass

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
    """Login user and return tokens.

    Tries the regular user collection first. On miss / password failure,
    falls back to the platform_admins collection (above-CEO operator
    identity). Platform admins get an `is_platform_admin=True` JWT claim.

    Per P0.3 audit anchor: counts failed attempts per (ip, email) in a
    Mongo TTL collection. After 5 fails in the 15-minute window we return
    429 with a ``Retry-After`` header (no captcha — out of audit scope).
    """
    from app.models.platform_admin import PlatformAdminModel
    from app.models.platform_settings import PlatformSettingsModel
    from app.utils.login_throttle import (
        clear_for_email,
        is_blocked,
        record_failure,
        retry_after_seconds,
    )

    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Pre-flight throttle check. ``remote_addr`` is the direct peer; behind
    # a reverse proxy ``X-Forwarded-For`` is honoured via Flask's
    # ``ProxyFix`` middleware where deployed.
    client_ip = request.remote_addr or ''
    if is_blocked(client_ip, email):
        retry = retry_after_seconds()
        resp = jsonify({
            'error': 'Too many failed attempts. Try again later.',
            'code': 'login_throttled',
        })
        resp.headers['Retry-After'] = str(retry)
        return resp, 429

    # Find user
    user = UserModel.find_by_email(email)
    user_password_ok = bool(user) and UserModel.verify_password(user, password)

    if not user_password_ok:
        # Fall back to platform admin identity.
        pa = PlatformAdminModel.find_by_email(email)
        if pa and PlatformAdminModel.verify_password(pa, password):
            pa_id = str(pa['_id'])
            access_token = create_access_token(
                identity=pa_id,
                additional_claims={'is_platform_admin': True},
            )
            refresh_token = create_refresh_token(
                identity=pa_id,
                additional_claims={'is_platform_admin': True},
            )
            try:
                PlatformAdminModel.update_last_active(pa_id)
            except Exception as exc:
                logger.warning('PlatformAdminModel.update_last_active failed: %s', exc)
            clear_for_email(email)
            return jsonify({
                'access_token': access_token,
                'refresh_token': refresh_token,
                'token_type': 'Bearer',
                'expires_in': 900,
                'user': {
                    'id': pa_id,
                    'email': pa['email'],
                    'display_name': pa.get('display_name', 'Platform Operator'),
                    'role': 'platform_admin',
                    'is_platform_admin': True,
                },
            }), 200
        record_failure(client_ip, email)
        return jsonify({'error': 'Invalid email or password'}), 401

    # Regular user path.
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
    clear_for_email(email)

    # Resolve platform feature flags (None-safe).
    try:
        features = PlatformSettingsModel.get()['features']
    except Exception as exc:
        logger.warning('PlatformSettingsModel.get features failed: %s', exc)
        features = {}

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'Bearer',
        'expires_in': 900,  # 15 minutes
        'features': features,
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
    """Refresh access token.

    Lifts the `is_platform_admin` claim from the refresh token (if present)
    into the new access token so the platform-admin session survives across
    refreshes.
    """
    identity = get_jwt_identity()
    claims = get_jwt()
    extra = {}
    if claims.get('is_platform_admin'):
        extra['is_platform_admin'] = True
    access_token = create_access_token(
        identity=identity,
        additional_claims=extra if extra else None,
    )

    return jsonify({
        'access_token': access_token,
        'token_type': 'Bearer',
        'expires_in': 900
    }), 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    """Logout user - revoke access token and optionally refresh token"""
    now = datetime.utcnow()

    # Revoke the access token presented in the Authorization header
    access_jti = get_jwt()['jti']
    mongo.db.revoked_tokens.insert_one({'jti': access_jti, 'created_at': now})

    # Optionally revoke the refresh token if the client sends it in the body
    data = request.get_json(silent=True) or {}
    refresh_token = data.get('refresh_token')
    if refresh_token:
        try:
            decoded = decode_token(refresh_token, allow_expired=True)
            refresh_jti = decoded.get('jti')
            if refresh_jti and refresh_jti != access_jti:
                mongo.db.revoked_tokens.insert_one({'jti': refresh_jti, 'created_at': now})
        except Exception as e:
            logger.warning("logout: could not decode refresh_token: %s", e)

    return jsonify({'message': 'Successfully logged out'}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user_info():
    """Get current user information.

    Branches on the JWT's `is_platform_admin` claim to load the right
    identity collection. Regular users get the `features` flag map merged
    in from PlatformSettings; platform admins see every feature on.
    """
    from app.models.platform_settings import PlatformSettingsModel, DEFAULT_FEATURES

    claims = get_jwt()
    if claims.get('is_platform_admin'):
        from app.models.platform_admin import PlatformAdminModel
        pa = PlatformAdminModel.find_by_id(get_jwt_identity())
        if not pa:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({
            'id': str(pa['_id']),
            'email': pa['email'],
            'role': 'platform_admin',
            'is_platform_admin': True,
            'profile': {
                'display_name': pa.get('display_name', 'Platform Operator'),
                'avatar_url': None,
                'bio': '',
            },
            'created_at': pa['created_at'].isoformat() if pa.get('created_at') else None,
            'features': dict.fromkeys(DEFAULT_FEATURES.keys(), True),
        }), 200

    user = get_current_user()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    try:
        features = PlatformSettingsModel.get()['features']
    except Exception as exc:
        logger.warning('PlatformSettingsModel.get features failed: %s', exc)
        features = {}

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
        'created_at': user['created_at'].isoformat(),
        'features': features,
    }), 200


@auth_bp.route('/password', methods=['PUT'])
@jwt_required()
def change_password():
    """Change user password"""
    user = get_current_user()
    data = request.get_json(silent=True) or {}

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
