"""Shared Flask app context for the scheduler.

The scheduler runs entirely outside Flask's request lifecycle, but it reuses
backend models (MessageModel, ConversationModel, KnowledgeItemModel, …) which
read `mongo.db` from the Flask app config. Wrap every backend model call with::

    from scheduler.flask_ctx import flask_app
    with flask_app.app_context():
        UserModel.find_by_id(...)

Pattern lifted from `backend/app/routes/automate_agent_stream.py`. CLAUDE.md
"Eventlet greenlets + Flask app context" describes the same gotcha — it applies
equally to asyncio code.
"""
import os
import logging

# scheduler/__init__.py runs load_dotenv at package import time; safe to import app.* now.
from app import create_app

# Force-set env so create_app's prod guards don't trip in dev
os.environ.setdefault('FLASK_ENV', 'development')

flask_app = create_app()

# Boot-time visibility: log key prefixes so 401s are easy to diagnose.
_log = logging.getLogger('unichat-scheduler')
with flask_app.app_context():
    _key = (flask_app.config.get('OPENROUTER_API_KEY') or '')
    _log.info('OPENROUTER_API_KEY loaded: prefix=%s len=%d', _key[:14] or '<empty>', len(_key))
