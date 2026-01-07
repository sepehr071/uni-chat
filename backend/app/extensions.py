from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager

# Initialize extensions without app
mongo = PyMongo()
jwt = JWTManager()


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


@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    """Check if token has been revoked"""
    jti = jwt_payload["jti"]
    token = mongo.db.revoked_tokens.find_one({"jti": jti})
    return token is not None
