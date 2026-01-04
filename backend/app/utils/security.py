from functools import wraps
from flask import request, g


def add_security_headers(response):
    """Add security headers to response"""
    # Prevent XSS
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'

    # Referrer policy
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    # Permissions policy
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'

    return response


def require_https(f):
    """Decorator to require HTTPS in production"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not request.is_secure and request.headers.get('X-Forwarded-Proto', 'http') != 'https':
            if g.get('production', False):
                return {'error': 'HTTPS required'}, 403
        return f(*args, **kwargs)
    return decorated_function


def log_request():
    """Log request information for debugging and monitoring"""
    import logging
    logger = logging.getLogger('unichat.requests')

    logger.info(
        'Request: %s %s | IP: %s | User-Agent: %s',
        request.method,
        request.path,
        request.remote_addr,
        request.user_agent.string[:100] if request.user_agent else 'Unknown'
    )
