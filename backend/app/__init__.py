import os
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_swagger_ui import get_swaggerui_blueprint

from app.config import Config
from app.extensions import mongo, jwt

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Guard against unsafe production settings leaking in
    if os.environ.get('FLASK_ENV') == 'production':
        cors = app.config.get('CORS_ORIGINS', '')
        if not cors or cors == '*':
            raise RuntimeError(
                "Production misconfiguration: CORS_ORIGINS must be set to an explicit "
                "origin list (not '*'). Set the CORS_ORIGINS environment variable."
            )
        if not app.config.get('RATELIMIT_ENABLED', False):
            raise RuntimeError(
                "Production misconfiguration: RATELIMIT_ENABLED must be True in production."
            )

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
    from app.routes.docs import docs_bp
    from app.routes.canvas import canvas_bp
    from app.routes.ai_preferences import ai_preferences_bp
    from app.routes.knowledge import knowledge_bp
    from app.routes.knowledge_folders import knowledge_folders_bp
    from app.routes.debate import debate_bp
    from app.routes.debate_stream import debate_stream_bp
    from app.routes.automate_agent import automate_agent_bp
    from app.routes.automate_agent_stream import automate_agent_stream_bp
    from app.routes.telegram_link import telegram_link_bp
    from app.routes.routines import routines_bp
    from app.routes.routines_nl import routines_nl_bp
    from app.routes.model_catalog import model_catalog_bp
    from app.routes.usage import usage_bp
    from app.routes.workspaces import workspaces_bp

    # Swagger UI configuration
    SWAGGER_URL = '/api/docs'
    API_URL = '/api/openapi.yaml'
    swaggerui_blueprint = get_swaggerui_blueprint(
        SWAGGER_URL,
        API_URL,
        config={
            'app_name': 'Uni-Chat API',
            'docExpansion': 'list',
            'defaultModelsExpandDepth': 1,
            'persistAuthorization': True
        }
    )

    app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)
    app.register_blueprint(docs_bp, url_prefix='/api')
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
    app.register_blueprint(canvas_bp, url_prefix='/api/canvas')
    app.register_blueprint(ai_preferences_bp, url_prefix='/api/users')
    app.register_blueprint(knowledge_bp, url_prefix='/api/knowledge')
    app.register_blueprint(knowledge_folders_bp, url_prefix='/api/knowledge-folders')
    app.register_blueprint(debate_bp, url_prefix='/api/debate')
    app.register_blueprint(debate_stream_bp, url_prefix='/api/debate')
    app.register_blueprint(automate_agent_bp, url_prefix='/api/automate-agent')
    app.register_blueprint(automate_agent_stream_bp, url_prefix='/api/automate-agent')
    app.register_blueprint(telegram_link_bp, url_prefix='/api/users/telegram')
    app.register_blueprint(routines_bp, url_prefix='/api/routines')
    app.register_blueprint(routines_nl_bp, url_prefix='/api/routines')
    app.register_blueprint(model_catalog_bp, url_prefix='/api/models')
    app.register_blueprint(usage_bp, url_prefix='/api')
    app.register_blueprint(workspaces_bp, url_prefix='/api/workspaces')

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

        # Ensure collection indexes (best-effort — Mongo may be down at boot in dev)
        try:
            from app.models.openrouter_model import OpenRouterModelDoc
            OpenRouterModelDoc.create_indexes()
        except Exception as e:
            app.logger.warning('OpenRouterModelDoc.create_indexes failed: %s', e)

        try:
            from app.models.workspace import WorkspaceModel
            from app.models.workspace_member import WorkspaceMemberModel
            from app.models.workspace_invite import WorkspaceInviteModel
            WorkspaceModel.create_indexes()
            WorkspaceMemberModel.create_indexes()
            WorkspaceInviteModel.create_indexes()
        except Exception as e:
            app.logger.warning('Workspace.create_indexes failed: %s', e)

    return app
