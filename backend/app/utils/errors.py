from flask import jsonify


class APIError(Exception):
    """Base API Error"""
    def __init__(self, message, status_code=400, payload=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['error'] = self.message
        rv['status'] = self.status_code
        return rv


class ValidationError(APIError):
    """Validation error"""
    def __init__(self, message, payload=None):
        super().__init__(message, status_code=400, payload=payload)


class AuthenticationError(APIError):
    """Authentication error"""
    def __init__(self, message="Authentication required", payload=None):
        super().__init__(message, status_code=401, payload=payload)


class AuthorizationError(APIError):
    """Authorization error"""
    def __init__(self, message="Permission denied", payload=None):
        super().__init__(message, status_code=403, payload=payload)


class NotFoundError(APIError):
    """Resource not found error"""
    def __init__(self, message="Resource not found", payload=None):
        super().__init__(message, status_code=404, payload=payload)


class RateLimitError(APIError):
    """Rate limit exceeded error"""
    def __init__(self, message="Rate limit exceeded", payload=None):
        super().__init__(message, status_code=429, payload=payload)


def register_error_handlers(app):
    """Register error handlers for the Flask app"""

    @app.errorhandler(APIError)
    def handle_api_error(error):
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({'error': 'Bad request', 'status': 400}), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({'error': 'Unauthorized', 'status': 401}), 401

    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({'error': 'Forbidden', 'status': 403}), 403

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Not found', 'status': 404}), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({'error': 'Internal server error', 'status': 500}), 500
