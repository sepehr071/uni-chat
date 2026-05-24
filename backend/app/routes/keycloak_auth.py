"""Keycloak SSO routes.

* ``POST /api/auth/keycloak/sync`` — frontend posts a KC access token it just
  obtained via the PKCE code-exchange. We verify the token directly (RS256
  against KC's JWKS), upsert the matching ``users`` row by KC ``sub``, and
  echo back the same access token. We do NOT mint a separate HS256 JWT —
  the rest of the backend has been switched to accept KC RS256 tokens.

* ``GET /api/auth/keycloak/config`` — public bootstrap endpoint so the SPA
  can wire up its OIDC client without having to bake Keycloak URLs at
  build time. Returns ``{}`` when SSO is disabled so the frontend can fall
  back to the legacy email/password form gracefully.
"""
from __future__ import annotations

import logging
import time

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.models.user import UserModel
from app.services.keycloak import get_keycloak_client

logger = logging.getLogger(__name__)

keycloak_auth_bp = Blueprint('keycloak_auth', __name__)


@keycloak_auth_bp.route('/config', methods=['GET'])
def keycloak_config():
    """Return public SSO bootstrap info, or ``{}`` if SSO is disabled."""
    cfg = current_app.config
    url = (cfg.get('KEYCLOAK_URL') or '').rstrip('/')
    realm = cfg.get('KEYCLOAK_REALM') or ''
    client_id = cfg.get('KEYCLOAK_CLIENT_ID') or ''
    if not url or not realm or not client_id:
        return jsonify({}), 200
    return jsonify({
        'url': url,
        'realm': realm,
        'client_id': client_id,
        'post_logout_redirect_uri': request.host_url + 'login',
    }), 200


@keycloak_auth_bp.route('/sync', methods=['POST'])
def keycloak_sync():
    """Verify a Keycloak access token and upsert the matching local user."""
    client = get_keycloak_client()
    if client is None:
        return jsonify({'error': 'Keycloak SSO is not configured'}), 503

    data = request.get_json(silent=True) or {}
    access_token = (data.get('access_token') or '').strip()
    if not access_token:
        return jsonify({'error': 'access_token is required'}), 400
    id_token = data.get('id_token')  # noqa: F841 — accepted for forward compat / logout hint
    refresh_token = data.get('refresh_token')  # echoed back to SPA, not validated here

    # Deep debug: log the raw token's header + unverified claims BEFORE verify.
    try:
        _hdr = jwt.get_unverified_header(access_token)
        _unv = jwt.decode(access_token, options={'verify_signature': False, 'verify_aud': False, 'verify_exp': False})
        logger.warning(
            'keycloak /sync DEBUG: header=%s | iss=%s | aud=%s | azp=%s | exp=%s | sub=%s | email=%s | preferred_username=%s | realm_access.roles=%s',
            _hdr,
            _unv.get('iss'),
            _unv.get('aud'),
            _unv.get('azp'),
            _unv.get('exp'),
            _unv.get('sub'),
            _unv.get('email'),
            _unv.get('preferred_username'),
            (_unv.get('realm_access') or {}).get('roles'),
        )
        logger.warning(
            'keycloak /sync DEBUG: expected issuer=%s/realms/%s | expected audience=%s',
            client.base_url, client.realm, client.expected_audience,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning('keycloak /sync DEBUG: failed to pre-decode token: %s', exc)

    try:
        claims = client.verify_access_token(access_token)
    except jwt.InvalidTokenError as exc:
        logger.warning('keycloak /sync: token verification failed: %s: %s', type(exc).__name__, exc)
        return jsonify({'error': 'Invalid Keycloak access token', 'detail': f'{type(exc).__name__}: {exc}'}), 401
    except Exception as exc:  # noqa: BLE001 — network/JWKS failures bubble as 401
        logger.exception('keycloak /sync: unexpected verification failure')
        return jsonify({'error': 'Token verification failed', 'detail': f'{type(exc).__name__}: {exc}'}), 401

    profile = client.extract_profile(claims)
    role = client.map_roles(claims)
    if not profile['sub']:
        return jsonify({'error': "Token missing 'sub' claim"}), 401
    if not profile['email']:
        return jsonify({'error': "Token missing 'email' / 'preferred_username'"}), 401

    try:
        user = UserModel.upsert_from_keycloak(
            sub=profile['sub'],
            email=profile['email'],
            display_name=profile['display_name'],
            role=role,
        )
    except AttributeError:
        # Teammate hasn't landed the model helper yet — surface a clean 503
        # so the SPA fails closed without 500'ing.
        logger.exception('keycloak /sync: UserModel.upsert_from_keycloak missing')
        return jsonify({'error': 'Keycloak user provisioning is not yet wired'}), 503
    except Exception:
        logger.exception('keycloak /sync: failed to upsert user')
        return jsonify({'error': 'Failed to provision user'}), 500

    if not user:
        return jsonify({'error': 'Failed to provision user'}), 500

    # Suspended accounts cannot log in even via SSO.
    if user.get('status', {}).get('is_banned', False):
        return jsonify({
            'error': 'Account has been suspended',
            'reason': user.get('status', {}).get('ban_reason', 'No reason provided'),
        }), 403

    user_id = str(user['_id'])
    try:
        UserModel.update_last_active(user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning('keycloak /sync: update_last_active failed: %s', exc)

    # Mirror /login: surface platform feature flags so the SPA doesn't flash
    # an everything-off shell while /auth/me is in flight.
    try:
        from app.models.platform_settings import PlatformSettingsModel
        features = PlatformSettingsModel.get()['features']
    except Exception as exc:  # noqa: BLE001
        logger.warning('keycloak /sync: PlatformSettingsModel.get features failed: %s', exc)
        features = {}

    now = int(time.time())
    exp = int(claims.get('exp') or now)
    expires_in = max(exp - now, 0)

    profile_doc = user.get('profile') or {}
    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'token_type': 'Bearer',
        'expires_in': expires_in,
        'features': features,
        'user': {
            'id': user_id,
            'email': user['email'],
            'display_name': profile_doc.get('display_name') or profile['display_name'],
            'role': user.get('role', role),
            'avatar_url': profile_doc.get('avatar_url'),
        },
    }), 200
