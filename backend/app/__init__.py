from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_socketio import SocketIO

from app.config import Config
from app.extensions import mongo, jwt, socketio

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    CORS(app, supports_credentials=True)
    mongo.init_app(app)
    jwt.init_app(app)
    socketio.init_app(app, cors_allowed_origins="*", async_mode='eventlet')

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.chat import chat_bp
    from app.routes.conversations import conversations_bp
    from app.routes.configs import configs_bp
    from app.routes.gallery import gallery_bp
    from app.routes.users import users_bp
    from app.routes.admin import admin_bp
    from app.routes.uploads import uploads_bp
    from app.routes.models import models_bp
    from app.routes.folders import folders_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(conversations_bp, url_prefix='/api/conversations')
    app.register_blueprint(configs_bp, url_prefix='/api/configs')
    app.register_blueprint(gallery_bp, url_prefix='/api/gallery')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(uploads_bp, url_prefix='/api/uploads')
    app.register_blueprint(models_bp, url_prefix='/api/models')
    app.register_blueprint(folders_bp, url_prefix='/api/folders')

    # Register socket events
    from app.sockets import register_socket_events
    register_socket_events(socketio)

    # Error handlers
    from app.utils.errors import register_error_handlers
    register_error_handlers(app)

    return app
