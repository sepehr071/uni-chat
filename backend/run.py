import os
from dotenv import load_dotenv
load_dotenv()  # Load .env file before creating app

from app import create_app

app = create_app()

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.environ.get('PORT', 5000))
    # Use threaded=True for SSE streaming support
    app.run(debug=debug, host='0.0.0.0', port=port, threaded=True)
