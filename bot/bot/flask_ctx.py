"""
Imports the Flask app once at module load, so handlers can do:

    from bot.flask_ctx import flask_app
    with flask_app.app_context():
        UserModel.find_by_id(...)
"""
import os
# bot/__init__.py runs load_dotenv at package import time; safe to import app.* here.
from app import create_app

# Force-set env so create_app's prod guards don't trip in dev
os.environ.setdefault('FLASK_ENV', 'development')

flask_app = create_app()

# Boot-time visibility: log key prefixes so 401s are easy to diagnose.
import logging
_l = logging.getLogger('unichat-bot')
with flask_app.app_context():
    _key = (flask_app.config.get('OPENROUTER_API_KEY') or '')
    _l.info('OPENROUTER_API_KEY loaded: prefix=%s len=%d', _key[:14] or '<empty>', len(_key))
