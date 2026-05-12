"""Tests for app/utils/audit.py — admin audit-log decorators.

Drives the decorator directly through a pushed `test_request_context` so we
exercise the request/JWT/AuditLog write path without registering new url rules
on the session-scoped Flask app (which Flask 3 refuses after first dispatch).
"""

from bson import ObjectId
from flask import jsonify

from app.extensions import mongo
from app.utils.audit import (
    audit_action,
    audit_user_ban,
    audit_user_unban,
    audit_role_change,
    audit_template_create,
    audit_template_delete,
)


class _StubUser:
    """Mimics the dict-like Flask-JWT-Extended `get_current_user()` result."""

    def __init__(self, oid):
        self._d = {'_id': oid}

    def __getitem__(self, k):
        return self._d[k]

    def __bool__(self):
        return True


def _patch_current_user(monkeypatch, oid):
    from app.utils import audit as audit_mod
    monkeypatch.setattr(audit_mod, 'get_current_user', lambda: _StubUser(oid))


def test_audit_action_writes_row(app, db, monkeypatch):
    admin_oid = ObjectId()
    _patch_current_user(monkeypatch, admin_oid)

    @audit_action(
        action='unit_test_action',
        get_target=lambda req, kwargs, res: (str(ObjectId()), 'thing'),
        get_details=lambda req, kwargs, res: {'k': 'v'},
    )
    def view():
        return jsonify({'ok': True})

    with app.test_request_context(
        '/_test/audit_basic', method='POST', json={},
        headers={'X-Forwarded-For': '1.2.3.4'},
    ):
        resp = view()
        assert resp.status_code == 200

    rows = list(mongo.db.audit_logs.find({'action': 'unit_test_action'}))
    assert len(rows) == 1
    row = rows[0]
    assert row['admin_id'] == admin_oid
    assert row['target_type'] == 'thing'
    assert row['details'] == {'k': 'v'}
    assert row['ip_address'] == '1.2.3.4'


def test_audit_action_no_target_no_details(app, db, monkeypatch):
    admin_oid = ObjectId()
    _patch_current_user(monkeypatch, admin_oid)

    @audit_action(action='no_target_action')
    def view():
        return 'x'

    with app.test_request_context('/_test/x', method='POST'):
        view()

    rows = list(mongo.db.audit_logs.find({'action': 'no_target_action'}))
    assert len(rows) == 1
    assert rows[0]['target_id'] is None
    assert rows[0]['target_type'] is None
    assert rows[0]['details'] == {}


def test_audit_action_swallows_logging_errors(app, db, monkeypatch):
    """If audit insert blows up, wrapped view still returns its response."""
    _patch_current_user(monkeypatch, ObjectId())

    from app.models.audit_log import AuditLogModel

    def _boom(*a, **kw):
        raise RuntimeError('mongo down')

    monkeypatch.setattr(AuditLogModel, 'create', staticmethod(_boom))

    @audit_action(action='err_action')
    def view():
        return jsonify({'ok': True})

    with app.test_request_context('/_test/x', method='POST'):
        resp = view()
        assert resp.status_code == 200
        assert resp.get_json() == {'ok': True}


def test_audit_action_uses_remote_addr_fallback(app, db, monkeypatch):
    admin_oid = ObjectId()
    _patch_current_user(monkeypatch, admin_oid)

    @audit_action(action='ip_fallback_action')
    def view():
        return jsonify({'ok': True})

    with app.test_request_context(
        '/_test/x', method='POST',
        environ_overrides={'REMOTE_ADDR': '9.9.9.9'},
    ):
        view()

    row = mongo.db.audit_logs.find_one({'action': 'ip_fallback_action'})
    assert row is not None and row['ip_address'] == '9.9.9.9'


def test_audit_user_ban_uses_user_id_and_reason(app, db, monkeypatch):
    _patch_current_user(monkeypatch, ObjectId())
    target_uid = str(ObjectId())

    @audit_user_ban
    def view(user_id):
        return jsonify({'banned': True})

    with app.test_request_context('/_test/x', method='POST', json={'reason': 'spam'}):
        view(user_id=target_uid)

    row = mongo.db.audit_logs.find_one({'action': 'user_ban'})
    assert row is not None
    assert str(row['target_id']) == target_uid
    assert row['target_type'] == 'user'
    assert row['details'] == {'reason': 'spam'}


def test_audit_user_unban(app, db, monkeypatch):
    _patch_current_user(monkeypatch, ObjectId())
    target_uid = str(ObjectId())

    @audit_user_unban
    def view(user_id):
        return jsonify({'ok': True})

    with app.test_request_context('/_test/x', method='POST', json={}):
        view(user_id=target_uid)

    row = mongo.db.audit_logs.find_one({'action': 'user_unban'})
    assert row is not None
    assert row['target_type'] == 'user'


def test_audit_role_change_carries_new_role(app, db, monkeypatch):
    _patch_current_user(monkeypatch, ObjectId())
    target_uid = str(ObjectId())

    @audit_role_change
    def view(user_id):
        return jsonify({'ok': True})

    with app.test_request_context('/_test/x', method='POST', json={'role': 'manager'}):
        view(user_id=target_uid)

    row = mongo.db.audit_logs.find_one({'action': 'role_change'})
    assert row is not None
    assert row['details'] == {'new_role': 'manager'}


def test_audit_template_create_and_delete(app, db, monkeypatch):
    _patch_current_user(monkeypatch, ObjectId())
    tpl_id = str(ObjectId())

    @audit_template_create
    def create_view():
        return jsonify({'ok': True})

    with app.test_request_context('/_test/x', method='POST', json={'name': 'My Template'}):
        create_view()

    row = mongo.db.audit_logs.find_one({'action': 'template_create'})
    assert row is not None and row['details'] == {'name': 'My Template'}

    @audit_template_delete
    def delete_view(template_id):
        return jsonify({'ok': True})

    with app.test_request_context('/_test/x', method='POST', json={}):
        delete_view(template_id=tpl_id)

    row2 = mongo.db.audit_logs.find_one({'action': 'template_delete'})
    assert row2 is not None
    assert str(row2['target_id']) == tpl_id
    assert row2['target_type'] == 'template'
