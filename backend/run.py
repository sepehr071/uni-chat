import os
from dotenv import load_dotenv
load_dotenv()  # Load .env file before creating app

from app import create_app

app = create_app()

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.environ.get('PORT', 5000))
    # Allow explicit override; default to 127.0.0.1 in production, 0.0.0.0 in dev
    explicit_host = os.environ.get('FLASK_RUN_HOST')
    if explicit_host:
        host = explicit_host
    elif os.environ.get('FLASK_ENV') == 'production':
        host = '127.0.0.1'
    else:
        host = '0.0.0.0'
    # Use threaded=True for SSE streaming support
    app.run(debug=debug, host=host, port=port, threaded=True)
