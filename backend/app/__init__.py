import os
from pathlib import Path
from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_swagger_ui import get_swaggerui_blueprint

from app.config import Config
from app.extensions import mongo, jwt
from app.utils.db_indexes import self_healing_indexes

def create_app(config_class=Config):
    static_dir = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
    if not static_dir.exists():
        import logging
        logging.getLogger(__name__).warning(
            'frontend/dist/ not found — SPA serving disabled until you run: cd frontend && npm run build'
        )
    # We disable Flask's built-in static route (would shadow our SPA catch-all
    # at static_url_path=''). The catch-all below serves dist/ contents itself.
    app = Flask(__name__, static_folder=None)
    app.config['SPA_DIST'] = str(static_dir)
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
    # CORS: when CORS_ORIGINS is set to an explicit list, pass it; otherwise
    # let flask-cors default to '*' (passing None or '*' explicitly trips a
    # NoneType iteration bug in flask-cors v6 internal regex probe).
    raw_origins = app.config.get('CORS_ORIGINS')
    cors_kwargs = {'supports_credentials': True}
    if raw_origins:
        if isinstance(raw_origins, str):
            origins_list = [o.strip() for o in raw_origins.split(',') if o.strip() and o.strip() != '*']
        else:
            origins_list = [o for o in raw_origins if o and o != '*']
        if origins_list:
            cors_kwargs['origins'] = origins_list
    CORS(app, **cors_kwargs)
    mongo.init_app(app)
    jwt.init_app(app)

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.chat import chat_bp
    from app.routes.conversations import conversations_bp
    from app.routes.configs import configs_bp
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
    from app.routes.helper import helper_bp
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
    from app.routes.projects import projects_bp
    from app.routes.groups import groups_bp
    from app.routes.dlp import dlp_bp

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
    app.register_blueprint(helper_bp, url_prefix='/api/helper')
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
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    # Groups are nested under workspaces — same prefix as workspaces_bp.
    app.register_blueprint(groups_bp, url_prefix='/api/workspaces')
    app.register_blueprint(dlp_bp, url_prefix='/api')

    # Error handlers
    from app.utils.errors import register_error_handlers
    register_error_handlers(app)

    # Security headers on every response
    from app.utils.security import add_security_headers
    app.after_request(add_security_headers)

    # SPA catch-all: serve frontend/dist/ assets + index.html fallback for any
    # non-API path. Registered AFTER all blueprints so /api/* routes win.
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def spa(path):
        if path.startswith('api/'):
            from flask import abort
            abort(404)
        dist = app.config.get('SPA_DIST')
        if not dist or not Path(dist).is_dir():
            from flask import abort
            abort(404)
        file_path = Path(dist) / path
        if path and file_path.exists() and file_path.is_file():
            return send_from_directory(dist, path)
        return send_from_directory(dist, 'index.html')

    # Create default admin user if configured
    with app.app_context():
        admin_email = os.environ.get('ADMIN_EMAIL')
        admin_password = os.environ.get('ADMIN_PASSWORD')
        if admin_email and admin_password:
            _WEAK_PASSWORDS = {'admin123', 'password', 'changeme', 'admin', 'password123'}
            if len(admin_password) < 16 or admin_password.lower() in _WEAK_PASSWORDS:
                raise RuntimeError(
                    f"ADMIN_PASSWORD is insecure: must be >= 16 characters and must not be "
                    f"a common password ({', '.join(sorted(_WEAK_PASSWORDS))}). "
                    f"Set a strong ADMIN_PASSWORD in .env and restart."
                )
            from app.models.user import UserModel
            UserModel.ensure_default_admin(
                email=admin_email,
                password=admin_password,
                display_name=os.environ.get('ADMIN_NAME', 'Admin')
            )

        # Ensure collection indexes. self_healing_indexes() drops + recreates
        # any index whose stored options drift from the current spec (e.g. old
        # sparse flag, replaced text-index field set). Best-effort overall —
        # Mongo may be down at boot in dev.
        with self_healing_indexes():
            try:
                from app.models.openrouter_model import OpenRouterModelDoc
                OpenRouterModelDoc.create_indexes()
            except Exception as e:
                app.logger.warning('OpenRouterModelDoc.create_indexes failed: %s', e)

            try:
                from app.models.user import UserModel
                UserModel.create_indexes()
            except Exception as e:
                app.logger.warning('UserModel.create_indexes failed: %s', e)

            try:
                from app.models.conversation import ConversationModel
                ConversationModel.create_indexes()
            except Exception as e:
                app.logger.warning('ConversationModel.create_indexes failed: %s', e)

            try:
                from app.models.message import MessageModel
                MessageModel.create_indexes()
            except Exception as e:
                app.logger.warning('MessageModel.create_indexes failed: %s', e)

            try:
                from app.models.folder import FolderModel
                FolderModel.create_indexes()
            except Exception as e:
                app.logger.warning('FolderModel.create_indexes failed: %s', e)

            try:
                from app.models.llm_config import LLMConfigModel
                LLMConfigModel.create_indexes()
            except Exception as e:
                app.logger.warning('LLMConfigModel.create_indexes failed: %s', e)

            try:
                from app.models.knowledge_folder import KnowledgeFolderModel
                KnowledgeFolderModel.create_indexes()
            except Exception as e:
                app.logger.warning('KnowledgeFolderModel.create_indexes failed: %s', e)

            try:
                from app.models.knowledge_item import KnowledgeItemModel
                KnowledgeItemModel.create_indexes()
            except Exception as e:
                app.logger.warning('KnowledgeItemModel.create_indexes failed: %s', e)

            try:
                from app.models.routine import RoutineModel
                RoutineModel.create_indexes()
            except Exception as e:
                app.logger.warning('RoutineModel.create_indexes failed: %s', e)

            try:
                from app.models.routine_run import RoutineRunModel
                RoutineRunModel.create_indexes()
            except Exception as e:
                app.logger.warning('RoutineRunModel.create_indexes failed: %s', e)

            try:
                from app.models.workflow import WorkflowModel
                WorkflowModel.create_indexes()
            except Exception as e:
                app.logger.warning('WorkflowModel.create_indexes failed: %s', e)

            try:
                from app.models.helper_conversation import HelperConversationModel
                HelperConversationModel.create_indexes()
            except Exception as e:
                app.logger.warning('HelperConversationModel.create_indexes failed: %s', e)

            try:
                from app.models.automate_message import AutomateMessageModel
                AutomateMessageModel.create_indexes()
            except Exception as e:
                app.logger.warning('AutomateMessageModel.create_indexes failed: %s', e)

            try:
                from app.models.telegram_link_token import TelegramLinkTokenModel
                TelegramLinkTokenModel.create_indexes()
            except Exception as e:
                app.logger.warning('TelegramLinkTokenModel.create_indexes failed: %s', e)

            try:
                from app.models.audit_log import AuditLogModel
                AuditLogModel.create_indexes()
            except Exception as e:
                app.logger.warning('AuditLogModel.create_indexes failed: %s', e)

            try:
                from app.models.workspace import WorkspaceModel
                from app.models.workspace_member import WorkspaceMemberModel
                from app.models.workspace_invite import WorkspaceInviteModel
                WorkspaceModel.create_indexes()
                WorkspaceMemberModel.create_indexes()
                WorkspaceInviteModel.create_indexes()
            except Exception as e:
                app.logger.warning('Workspace.create_indexes failed: %s', e)

            try:
                from app.models.project import ProjectModel
                from app.models.project_member import ProjectMemberModel
                from app.models.project_webhook import ProjectWebhookModel
                ProjectModel.create_indexes()
                ProjectMemberModel.create_indexes()
                ProjectWebhookModel.create_indexes()
            except Exception as e:
                app.logger.warning('Project.create_indexes failed: %s', e)

            try:
                from app.models.group import GroupModel
                from app.models.group_member import GroupMemberModel
                from app.models.project_group_access import ProjectGroupAccessModel
                from app.models.credit_ledger import CreditLedgerModel
                from app.models.usage_log import UsageLogModel
                GroupModel.create_indexes()
                GroupMemberModel.create_indexes()
                ProjectGroupAccessModel.create_indexes()
                CreditLedgerModel.create_indexes()
                UsageLogModel.create_indexes()
            except Exception as e:
                app.logger.warning('Enterprise.create_indexes failed: %s', e)

            try:
                from app.models.dlp_event import DLPEventModel
                DLPEventModel.create_indexes()
            except Exception as e:
                app.logger.warning('DLPEventModel.create_indexes failed: %s', e)

    return app
