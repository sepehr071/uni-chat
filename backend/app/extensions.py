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


@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    """Load user from database when JWT is verified"""
    from bson import ObjectId
    identity = jwt_data["sub"]
    user = mongo.db.users.find_one({"_id": ObjectId(identity)})
    return user


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
