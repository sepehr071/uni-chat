"""Tests for app/utils/helpers.py, app/utils/errors.py, app/utils/security.py."""

from datetime import datetime

import pytest
from bson import ObjectId
from flask import Flask, jsonify

from app.utils.helpers import (
    serialize_doc,
    generate_conversation_title,
    validate_object_id,
    get_current_timestamp,
    sanitize_html,
)
from app.utils.errors import (
    APIError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    register_error_handlers,
)
from app.utils.security import add_security_headers, require_https, log_request


# ---------------------------------------------------------------------------
# helpers.py
# ---------------------------------------------------------------------------

class TestSerializeDoc:
    def test_none_returns_none(self):
        assert serialize_doc(None) is None

    def test_scalar_passthrough(self):
        assert serialize_doc(5) == 5
        assert serialize_doc('x') == 'x'

    def test_objectid_to_str(self):
        oid = ObjectId()
        assert serialize_doc(oid) == str(oid)

    def test_datetime_to_iso(self):
        dt = datetime(2026, 1, 2, 3, 4, 5)
        assert serialize_doc(dt) == dt.isoformat()

    def test_dict_recurses(self):
        oid = ObjectId()
        dt = datetime(2026, 1, 2)
        out = serialize_doc({'_id': oid, 'when': dt, 'count': 7, 'tags': ['a', oid]})
        assert out['_id'] == str(oid)
        assert out['when'] == dt.isoformat()
        assert out['count'] == 7
        assert out['tags'] == ['a', str(oid)]

    def test_list_of_dicts(self):
        oid1, oid2 = ObjectId(), ObjectId()
        out = serialize_doc([{'_id': oid1}, {'_id': oid2}])
        assert out == [{'_id': str(oid1)}, {'_id': str(oid2)}]


class TestGenerateConversationTitle:
    def test_short_unchanged(self):
        assert generate_conversation_title('hello') == 'hello'

    def test_collapses_whitespace(self):
        assert generate_conversation_title('a   b\n\tc') == 'a b c'

    def test_truncates_with_ellipsis(self):
        out = generate_conversation_title('x' * 100, max_length=20)
        assert out.endswith('...')
        assert len(out) == 20

    def test_empty_returns_fallback(self):
        assert generate_conversation_title('') == 'New conversation'
        assert generate_conversation_title('   ') == 'New conversation'


class TestValidateObjectId:
    def test_valid(self):
        assert validate_object_id(str(ObjectId())) is True

    def test_invalid(self):
        assert validate_object_id('not-an-oid') is False
        assert validate_object_id('') is False
        # ObjectId(None) generates a fresh OID, so None is considered valid.


class TestGetCurrentTimestamp:
    def test_returns_datetime(self):
        assert isinstance(get_current_timestamp(), datetime)


class TestSanitizeHtml:
    def test_empty_passthrough(self):
        assert sanitize_html('') == ''
        assert sanitize_html(None) is None

    def test_strips_script(self):
        out = sanitize_html('<p>hi</p><script>alert(1)</script><p>bye</p>')
        assert '<script>' not in out
        assert 'alert(1)' not in out
        assert '<p>hi</p>' in out
        assert '<p>bye</p>' in out

    def test_strips_uppercase_script(self):
        assert '<SCRIPT' not in sanitize_html('<SCRIPT>x</SCRIPT>').upper().replace('</SCRIPT>', '')

    def test_strips_multiline_script(self):
        out = sanitize_html('<script>\nvar x=1;\n</script>after')
        assert 'var x=1' not in out
        assert 'after' in out


# ---------------------------------------------------------------------------
# errors.py
# ---------------------------------------------------------------------------

class TestAPIError:
    def test_validation_error_400(self):
        e = ValidationError('bad input', payload={'field': 'name'})
        assert e.status_code == 400
        body = e.to_dict()
        assert body['error'] == 'bad input'
        assert body['status'] == 400
        assert body['field'] == 'name'

    def test_authentication_error_401(self):
        assert AuthenticationError().status_code == 401
        assert AuthenticationError('x').to_dict()['error'] == 'x'

    def test_authorization_error_403(self):
        assert AuthorizationError().status_code == 403

    def test_not_found_error_404(self):
        e = NotFoundError()
        assert e.status_code == 404
        assert e.to_dict()['error'] == 'Resource not found'

    def test_rate_limit_429(self):
        assert RateLimitError().status_code == 429

    def test_apierror_no_payload(self):
        e = APIError('whoops', status_code=418)
        d = e.to_dict()
        assert d == {'error': 'whoops', 'status': 418}


def _build_err_app():
    app = Flask(__name__)
    register_error_handlers(app)

    @app.route('/raise/<kind>')
    def boom(kind):
        if kind == 'api':
            raise APIError('api msg', status_code=422, payload={'extra': 'x'})
        if kind == 'val':
            raise ValidationError('val msg')
        if kind == 'auth':
            raise AuthenticationError()
        if kind == 'forbid':
            raise AuthorizationError()
        if kind == 'nf':
            raise NotFoundError()
        if kind == 'rl':
            raise RateLimitError()
        if kind == '500':
            raise RuntimeError('boom')
        return 'ok'
    return app


class TestErrorHandlers:
    def test_api_error_returns_payload(self):
        app = _build_err_app()
        client = app.test_client()
        r = client.get('/raise/api')
        assert r.status_code == 422
        body = r.get_json()
        assert body == {'error': 'api msg', 'status': 422, 'extra': 'x'}

    def test_validation_error_400(self):
        app = _build_err_app()
        r = app.test_client().get('/raise/val')
        assert r.status_code == 400

    def test_404_handler(self):
        app = _build_err_app()
        r = app.test_client().get('/nope')
        assert r.status_code == 404
        assert r.get_json() == {'error': 'Not found', 'status': 404}

    def test_500_handler(self):
        app = _build_err_app()
        app.config['PROPAGATE_EXCEPTIONS'] = False
        app.testing = False
        r = app.test_client().get('/raise/500')
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# security.py
# ---------------------------------------------------------------------------

class TestSecurityHeaders:
    def test_add_security_headers_sets_all(self):
        from flask import Response
        resp = Response('x')
        out = add_security_headers(resp)
        assert out.headers['X-Content-Type-Options'] == 'nosniff'
        assert out.headers['X-Frame-Options'] == 'DENY'
        assert out.headers['X-XSS-Protection'] == '1; mode=block'
        assert out.headers['Referrer-Policy'] == 'strict-origin-when-cross-origin'
        assert 'Permissions-Policy' in out.headers


def _build_https_app():
    app = Flask(__name__)

    @app.route('/normal')
    @require_https
    def normal():
        return 'ok'

    @app.route('/prod')
    @require_https
    def prod():
        from flask import g
        g.production = True
        return 'ok'

    return app


class TestRequireHttps:
    def test_non_prod_allows_http(self):
        app = _build_https_app()
        r = app.test_client().get('/normal')
        assert r.status_code == 200

    def test_proto_header_x_forwarded_https_passes(self):
        app = _build_https_app()
        r = app.test_client().get('/normal', headers={'X-Forwarded-Proto': 'https'})
        assert r.status_code == 200


class TestLogRequest:
    def test_logs_inside_request_context(self):
        app = Flask(__name__)
        with app.test_request_context('/x', headers={'User-Agent': 'pytest'}):
            log_request()  # just exercise — assert no exception
