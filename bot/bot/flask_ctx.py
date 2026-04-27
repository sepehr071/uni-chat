"""
Imports the Flask app once at module load, so handlers can do:

    from bot.flask_ctx import flask_app
    with flask_app.app_context():
        UserModel.find_by_id(...)
"""
import os
from app import create_app

# Force-set env so create_app's prod guards don't trip in dev
os.environ.setdefault('FLASK_ENV', 'development')

flask_app = create_app()
