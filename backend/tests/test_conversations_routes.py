"""Tests for app/routes/conversations.py — CRUD, archive, search, export, branches."""

import json

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.conversation import ConversationModel
from app.models.message import MessageModel


def _mk_conv(uid, title='C', config_id=None):
    return ConversationModel.create(uid, str(config_id or ObjectId()), title=title)


# ---------------------------------------------------------------------------
# /list + /<id>
# ---------------------------------------------------------------------------

class TestList:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/conversations', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['conversations'] == []

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/conversations?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_403(self, client, auth_headers):
        r = client.get(f'/api/conversations?project_id={ObjectId()}',
                       headers=auth_headers)
        assert r.status_code == 403

    def test_pagination_response_shape(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            _mk_conv(test_user['_id'])
        r = client.get('/api/conversations', headers=auth_headers)
        data = r.get_json()
        assert data['total'] >= 1
        assert 'has_more' in data


class TestGet:
    def test_not_found(self, client, auth_headers):
        r = client.get(f'/api/conversations/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.get(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_returns_messages(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        r = client.get(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert len(body['messages']) == 1
        assert body['active_branch'] == 'main'


# ---------------------------------------------------------------------------
# Create / update / move / delete
# ---------------------------------------------------------------------------

class TestCreate:
    def test_missing_config_id_400(self, client, auth_headers):
        r = client.post('/api/conversations', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_basic_create(self, client, test_user, auth_headers):
        r = client.post('/api/conversations',
                        json={'config_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 201

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.post('/api/conversations', json={
            'config_id': str(ObjectId()), 'project_id': 'bad',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_project_denied_403(self, client, auth_headers):
        r = client.post('/api/conversations', json={
            'config_id': str(ObjectId()), 'project_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 403


class TestUpdate:
    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.put(f"/api/conversations/{c['_id']}",
                       json={'title': 'X'}, headers=auth_headers)
        assert r.status_code == 404

    def test_cannot_reassign_project_via_put(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.put(f"/api/conversations/{c['_id']}",
                       json={'project_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_title_and_pin(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.put(f"/api/conversations/{c['_id']}", json={
            'title': 'New', 'is_pinned': True, 'tags': ['t'], 'folder_id': None,
        }, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['conversation']
        assert body['title'] == 'New'
        assert body['is_pinned'] is True


class TestMove:
    def test_not_found(self, client, auth_headers):
        r = client.post(f'/api/conversations/{ObjectId()}/move',
                        json={'project_id': None}, headers=auth_headers)
        assert r.status_code == 404

    def test_missing_project_id_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(f"/api/conversations/{c['_id']}/move",
                        json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_project_id_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(f"/api/conversations/{c['_id']}/move",
                        json={'project_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_no_access_to_target_403(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(f"/api/conversations/{c['_id']}/move",
                        json={'project_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 403

    def test_move_to_root_null(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(f"/api/conversations/{c['_id']}/move",
                        json={'project_id': None}, headers=auth_headers)
        assert r.status_code == 200


class TestDelete:
    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.delete(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_owner_delete_removes_messages(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        r = client.delete(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            assert ConversationModel.find_by_id(c['_id']) is None

    def test_owner_without_project_access_cannot_read_or_delete(
        self, app, db, client, test_user, auth_headers,
    ):
        """Bug 2 fix: user_id-match alone is no longer enough on a project-
        scoped conversation. Once the caller has lost access to the
        project, GET/DELETE/PUT/archive must all 403. Personal-scope
        conversations are unaffected.
        """
        with app.app_context():
            # Conversation is owned by test_user but lives in a project they
            # are NOT a member of (simulating "was a member, got removed").
            orphan_pid = ObjectId()
            c = ConversationModel.create(
                test_user['_id'], str(ObjectId()),
                title='Old project chat',
                project_id=str(orphan_pid),
            )
        # GET
        r_get = client.get(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r_get.status_code == 403, r_get.get_json()
        # PUT
        r_put = client.put(f"/api/conversations/{c['_id']}",
                           json={'title': 'x'}, headers=auth_headers)
        assert r_put.status_code == 403
        # Archive toggle
        r_arch = client.post(f"/api/conversations/{c['_id']}/archive",
                              headers=auth_headers)
        assert r_arch.status_code == 403
        # DELETE
        r_del = client.delete(f"/api/conversations/{c['_id']}", headers=auth_headers)
        assert r_del.status_code == 403
        # Branches list
        r_br = client.get(f"/api/conversations/{c['_id']}/branches",
                          headers=auth_headers)
        assert r_br.status_code == 403
        # Doc still present in DB (the 403 must be a pure access denial,
        # not a side-effect-then-deny).
        with app.app_context():
            assert ConversationModel.find_by_id(c['_id']) is not None


# ---------------------------------------------------------------------------
# Archive + search
# ---------------------------------------------------------------------------

class TestArchive:
    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.post(f"/api/conversations/{c['_id']}/archive", headers=auth_headers)
        assert r.status_code == 404

    def test_toggle(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(f"/api/conversations/{c['_id']}/archive", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['is_archived'] is True
        r2 = client.post(f"/api/conversations/{c['_id']}/archive", headers=auth_headers)
        assert r2.get_json()['is_archived'] is False


class TestSearch:
    def test_missing_q_400(self, client, auth_headers):
        r = client.get('/api/conversations/search', headers=auth_headers)
        assert r.status_code == 400

    def test_message_search_missing_q_400(self, client, auth_headers):
        r = client.get('/api/conversations/search/messages', headers=auth_headers)
        assert r.status_code == 400

    def test_message_search_no_conversations(self, client, test_user, auth_headers):
        r = client.get('/api/conversations/search/messages?q=hi', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 0


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class TestExport:
    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.get(f"/api/conversations/{c['_id']}/export", headers=auth_headers)
        assert r.status_code == 404

    def test_json_export(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'], title='Hello World')
            MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
            MessageModel.create(c['_id'], 'assistant', 'hello', branch_id='main')
        r = client.get(f"/api/conversations/{c['_id']}/export?format=json",
                       headers=auth_headers)
        assert r.status_code == 200
        assert r.mimetype == 'application/json'
        data = json.loads(r.data)
        assert len(data['messages']) == 2
        assert 'attachment' in r.headers['Content-Disposition']

    def test_md_export(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'], title='سلام')  # non-ASCII title
            MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        r = client.get(f"/api/conversations/{c['_id']}/export", headers=auth_headers)
        assert r.status_code == 200
        assert r.mimetype == 'text/markdown'
        assert '# سلام' in r.data.decode('utf-8')


# ---------------------------------------------------------------------------
# Branches
# ---------------------------------------------------------------------------

class TestBranches:
    def test_list_branches_default(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.get(f"/api/conversations/{c['_id']}/branches", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['active_branch'] == 'main'
        assert any(b['id'] == 'main' for b in data['branches'])

    def test_list_branches_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            c = _mk_conv(ObjectId())
        r = client.get(f"/api/conversations/{c['_id']}/branches", headers=auth_headers)
        assert r.status_code == 404

    def test_create_branch(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            m = MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        r = client.post(
            f"/api/conversations/{c['_id']}/branch/{m['_id']}",
            json={'name': 'Alt'}, headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.get_json()
        assert body['active_branch'] == body['branch_id']

    def test_create_branch_conv_not_found(self, client, auth_headers):
        r = client.post(
            f"/api/conversations/{ObjectId()}/branch/{ObjectId()}",
            json={}, headers=auth_headers,
        )
        assert r.status_code == 404

    def test_create_branch_message_not_found(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.post(
            f"/api/conversations/{c['_id']}/branch/{ObjectId()}",
            json={}, headers=auth_headers,
        )
        assert r.status_code == 404

    def test_switch_branch_404_when_branch_missing(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.put(f"/api/conversations/{c['_id']}/branch/missing-id",
                       headers=auth_headers)
        assert r.status_code == 404

    def test_delete_main_branch_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.delete(f"/api/conversations/{c['_id']}/branch/main",
                          headers=auth_headers)
        assert r.status_code == 400

    def test_delete_branch_missing_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.delete(f"/api/conversations/{c['_id']}/branch/abcd",
                          headers=auth_headers)
        assert r.status_code == 404

    def test_rename_main_branch_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
        r = client.put(f"/api/conversations/{c['_id']}/branch/main/rename",
                       json={'name': 'New'}, headers=auth_headers)
        assert r.status_code == 400

    def test_rename_blank_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        # First create a real branch
        with app.app_context():
            ConversationModel.add_branch(c['_id'], {
                'id': 'b1', 'name': 'Branch 1', 'parent_branch': 'main',
                'branch_point_message_id': None,
            })
        r = client.put(f"/api/conversations/{c['_id']}/branch/b1/rename",
                       json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_rename_too_long_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            ConversationModel.add_branch(c['_id'], {
                'id': 'b1', 'name': 'Branch 1', 'parent_branch': 'main',
                'branch_point_message_id': None,
            })
        r = client.put(f"/api/conversations/{c['_id']}/branch/b1/rename",
                       json={'name': 'x' * 51}, headers=auth_headers)
        assert r.status_code == 400

    def test_rename_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            ConversationModel.add_branch(c['_id'], {
                'id': 'b1', 'name': 'Branch 1', 'parent_branch': 'main',
                'branch_point_message_id': None,
            })
        r = client.put(f"/api/conversations/{c['_id']}/branch/b1/rename",
                       json={'name': 'Renamed'}, headers=auth_headers)
        assert r.status_code == 200

    def test_branch_to_new_no_messages_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            m = MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
            # delete it so find_up_to returns empty
            mongo.db.messages.delete_one({'_id': m['_id']})
        r = client.post(f"/api/conversations/{c['_id']}/branch-to-new/{m['_id']}",
                        json={}, headers=auth_headers)
        # Message gone -> 404 from message lookup
        assert r.status_code == 404

    def test_branch_to_new_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            c = _mk_conv(test_user['_id'])
            m = MessageModel.create(c['_id'], 'user', 'hi', branch_id='main')
        r = client.post(f"/api/conversations/{c['_id']}/branch-to-new/{m['_id']}",
                        json={}, headers=auth_headers)
        assert r.status_code == 201
        body = r.get_json()
        assert body['message_count'] >= 1
