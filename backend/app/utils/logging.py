import logging
import sys
import json
from datetime import datetime
from flask import request, g


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""

    def format(self, record):
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add request context if available
        try:
            if request:
                log_data['request'] = {
                    'method': request.method,
                    'path': request.path,
                    'ip': request.remote_addr,
                }
                if hasattr(g, 'user_id'):
                    log_data['user_id'] = g.user_id
        except RuntimeError:
            pass  # Outside request context

        # Add extra fields
        if hasattr(record, 'extra_data'):
            log_data.update(record.extra_data)

        return json.dumps(log_data)


def setup_logging(app):
    """Configure logging for the application"""
    # Remove default handlers
    app.logger.handlers.clear()

    # Create handler
    handler = logging.StreamHandler(sys.stdout)

    # Use JSON formatter in production
    if app.config.get('FLASK_ENV') == 'production':
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
        ))

    # Set level
    log_level = logging.DEBUG if app.config.get('DEBUG') else logging.INFO
    handler.setLevel(log_level)

    # Add to app logger
    app.logger.addHandler(handler)
    app.logger.setLevel(log_level)

    # Also configure root logger for libraries
    logging.getLogger().addHandler(handler)
    logging.getLogger().setLevel(logging.WARNING)

    return app.logger


def get_logger(name):
    """Get a logger with the given name"""
    return logging.getLogger(f'unichat.{name}')
