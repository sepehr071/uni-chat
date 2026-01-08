import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from app.config import Config
from app.extensions import mongo, jwt

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    CORS(app, supports_credentials=True)
    mongo.init_app(app)
    jwt.init_app(app)

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
    from app.routes.health import health_bp
    from app.routes.image_generation import image_gen_bp
    from app.routes.arena import arena_bp
    from app.routes.prompt_templates import prompt_templates_bp
    from app.routes.workflow import workflow_bp
    from app.routes.workflow_ai import workflow_ai_bp
    from app.routes.chat_stream import chat_stream_bp
    from app.routes.arena_stream import arena_stream_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(chat_stream_bp, url_prefix='/api/chat')
    app.register_blueprint(arena_stream_bp, url_prefix='/api/arena')
    app.register_blueprint(conversations_bp, url_prefix='/api/conversations')
    app.register_blueprint(configs_bp, url_prefix='/api/configs')
    app.register_blueprint(gallery_bp, url_prefix='/api/gallery')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(uploads_bp, url_prefix='/api/uploads')
    app.register_blueprint(models_bp, url_prefix='/api/models')
    app.register_blueprint(folders_bp, url_prefix='/api/folders')
    app.register_blueprint(health_bp, url_prefix='/api/health')
    app.register_blueprint(image_gen_bp, url_prefix='/api/image-gen')
    app.register_blueprint(prompt_templates_bp, url_prefix='/api/prompt-templates')
    app.register_blueprint(arena_bp, url_prefix='/api/arena')
    app.register_blueprint(workflow_bp, url_prefix='/api/workflow')
    app.register_blueprint(workflow_ai_bp, url_prefix='/api/workflow-ai')

    # Error handlers
    from app.utils.errors import register_error_handlers
    register_error_handlers(app)

    # Create default admin user if configured
    with app.app_context():
        admin_email = os.environ.get('ADMIN_EMAIL')
        admin_password = os.environ.get('ADMIN_PASSWORD')
        if admin_email and admin_password:
            from app.models.user import UserModel
            UserModel.ensure_default_admin(
                email=admin_email,
                password=admin_password,
                display_name=os.environ.get('ADMIN_NAME', 'Admin')
            )

    return app
