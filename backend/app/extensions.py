import logging

from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager

# Initialize extensions without app
mongo = PyMongo()
jwt = JWTManager()

_logger = logging.getLogger(__name__)


# JWT callbacks
@jwt.user_identity_loader
def user_identity_lookup(user):
    """Convert user object to JSON serializable format for JWT"""
    if isinstance(user, dict):
        return str(user.get('_id', user.get('id', '')))
    return str(user)


@jwt.decode_key_loader
def _decode_key_callback(unverified_headers, unverified_claims):
    """Per-token key selection. RS256 → JWKS (Keycloak); HS256 → JWT_SECRET_KEY (local)."""
    from flask import current_app
    alg = (unverified_headers or {}).get('alg', '')
    if alg == 'RS256':
        from app.services.keycloak import get_keycloak_client
        client = get_keycloak_client()
        if client is None:
            raise Exception('RS256 token presented but Keycloak not configured')
        kid = unverified_headers.get('kid')
        if not kid:
            raise Exception("RS256 token missing 'kid' header")
        # _public_key_for returns the converted RSA key directly and handles
        # force-refresh on kid miss internally. KeycloakClient.get_jwks()
        # returns {'keys': [...]} (JWKS shape) not a {kid: jwk} dict.
        return client._public_key_for(kid)
    return current_app.config['JWT_SECRET_KEY']


@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    """Load user from database when JWT is verified.

    Identity may be:
      - A users._id ObjectId hex (locally-minted HS256 tokens).
      - A platform_admins._id ObjectId hex when `is_platform_admin=True`.
      - A Keycloak `sub` UUID (RS256 tokens) → resolved via `users.keycloak_sub`.
    """
    from bson import ObjectId
    identity = jwt_data["sub"]
    try:
        oid = ObjectId(identity)
        user = mongo.db.users.find_one({"_id": oid})
        if user:
            return user
        if jwt_data.get("is_platform_admin"):
            return mongo.db.platform_admins.find_one({"_id": oid})
        return None
    except Exception:
        # Not an ObjectId — treat as Keycloak sub (UUID).
        return mongo.db.users.find_one({"keycloak_sub": identity})


@jwt.additional_claims_loader
def add_claims_to_token(identity):
    """Embed user role in the JWT so the UI can gate features without extra DB round-trips."""
    from bson import ObjectId
    try:
        user = mongo.db.users.find_one({"_id": ObjectId(identity)}, {"role": 1})
        return {"role": user.get("role", "user") if user else "user"}
    except Exception:
        return {"role": "user"}


@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    """Check if token has been revoked"""
    jti = jwt_payload["jti"]
    token = mongo.db.revoked_tokens.find_one({"jti": jti})
    return token is not None


@jwt.expired_token_loader
def _expired_token_callback(jwt_header, jwt_payload):
    from flask import request
    _logger.info("jwt expired: type=%s path=%s", jwt_payload.get("type"), request.path)
    return {"error": "Token has expired", "code": "token_expired"}, 401


@jwt.invalid_token_loader
def _invalid_token_callback(reason):
    from flask import request
    _logger.warning("jwt invalid: reason=%s path=%s", reason, request.path)
    return {"error": "Invalid token", "code": "token_invalid", "detail": reason}, 401


@jwt.unauthorized_loader
def _missing_token_callback(reason):
    from flask import request
    _logger.info("jwt missing: reason=%s path=%s", reason, request.path)
    return {"error": "Missing or malformed token", "code": "token_missing"}, 401


@jwt.revoked_token_loader
def _revoked_token_callback(jwt_header, jwt_payload):
    from flask import request
    _logger.info("jwt revoked: jti=%s path=%s", jwt_payload.get("jti"), request.path)
    return {"error": "Token has been revoked", "code": "token_revoked"}, 401
