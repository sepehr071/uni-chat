"""
WSGI entry point for production deployment with Gunicorn.

Usage with Gunicorn:
    gunicorn --workers 4 --threads 4 --bind 0.0.0.0:5000 wsgi:app

For SSE streaming support, use gthread worker:
    gunicorn --worker-class gthread --workers 2 --threads 4 --bind 0.0.0.0:5000 wsgi:app

Auto-deployed via GitHub Actions
"""
from dotenv import load_dotenv
load_dotenv()

from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run()
