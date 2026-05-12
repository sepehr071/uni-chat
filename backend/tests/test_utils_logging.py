"""Tests for app/utils/logging.py — JSONFormatter + setup_logging."""

import json
import logging

import pytest
from flask import Flask, g

from app.utils.logging import JSONFormatter, setup_logging, get_logger


class TestJSONFormatter:
    def _record(self, msg='hello', level=logging.INFO):
        return logging.LogRecord(
            name='unichat.test', level=level, pathname='', lineno=0,
            msg=msg, args=(), exc_info=None,
        )

    def test_basic_fields_outside_request_context(self):
        out = json.loads(JSONFormatter().format(self._record()))
        assert out['level'] == 'INFO'
        assert out['logger'] == 'unichat.test'
        assert out['message'] == 'hello'
        assert 'timestamp' in out
        assert 'request' not in out

    def test_exception_info_included(self):
        try:
            raise RuntimeError('bang')
        except RuntimeError:
            import sys
            rec = logging.LogRecord(
                name='unichat.test', level=logging.ERROR, pathname='', lineno=0,
                msg='oops', args=(), exc_info=sys.exc_info(),
            )
        body = json.loads(JSONFormatter().format(rec))
        assert 'exception' in body
        assert 'RuntimeError' in body['exception']

    def test_request_context_adds_request_block(self):
        app = Flask(__name__)
        with app.test_request_context('/foo', method='POST', headers={'X-Forwarded-For': '1.1.1.1'}):
            g.user_id = 'u-123'
            body = json.loads(JSONFormatter().format(self._record()))
        assert body['request']['method'] == 'POST'
        assert body['request']['path'] == '/foo'
        assert body['user_id'] == 'u-123'

    def test_extra_data_merged(self):
        rec = self._record()
        rec.extra_data = {'route_hits': 7}
        body = json.loads(JSONFormatter().format(rec))
        assert body['route_hits'] == 7


class TestSetupLogging:
    def test_dev_uses_plain_formatter(self):
        app = Flask(__name__)
        app.config['DEBUG'] = True
        app.config['FLASK_ENV'] = 'development'
        logger = setup_logging(app)
        assert logger.level == logging.DEBUG
        assert len(app.logger.handlers) >= 1

    def test_prod_uses_json_formatter(self):
        app = Flask(__name__)
        app.config['DEBUG'] = False
        app.config['FLASK_ENV'] = 'production'
        setup_logging(app)
        # First handler set in setup_logging uses JSONFormatter when prod.
        assert any(isinstance(h.formatter, JSONFormatter) for h in app.logger.handlers)


class TestGetLogger:
    def test_namespace_prefix(self):
        log = get_logger('mymod')
        assert log.name == 'unichat.mymod'
