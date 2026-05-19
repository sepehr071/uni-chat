"""Tests for app/routes/knowledge.py."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.knowledge_item import KnowledgeItemModel
from app.models.knowledge_folder import KnowledgeFolderModel


# ---------------------------------------------------------------------------
# /list
# ---------------------------------------------------------------------------

class TestList:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/knowledge/list', headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['items'] == []
        assert data['total'] == 0

    def test_pagination_shape(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            for _ in range(3):
                KnowledgeItemModel.create(test_user['_id'], 'chat',
                                          str(ObjectId()), str(ObjectId()))
        r = client.get('/api/knowledge/list?page=1&limit=2', headers=auth_headers)
        data = r.get_json()
        assert data['total'] == 3
        assert len(data['items']) == 2
        assert data['has_more'] is True
        assert data['total_pages'] == 2

    def test_tag_filter(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            KnowledgeItemModel.create(test_user['_id'], 'chat',
                                      str(ObjectId()), str(ObjectId()), tags=['py'])
            KnowledgeItemModel.create(test_user['_id'], 'chat',
                                      str(ObjectId()), str(ObjectId()), tags=['js'])
        r = client.get('/api/knowledge/list?tag=py', headers=auth_headers)
        assert r.get_json()['total'] == 1

    def test_favorite_filter(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()))
            KnowledgeItemModel.create(test_user['_id'], 'chat',
                                      str(ObjectId()), str(ObjectId()))
            KnowledgeItemModel.update(it['_id'], test_user['_id'], {'is_favorite': True})
        r = client.get('/api/knowledge/list?favorite=true', headers=auth_headers)
        assert r.get_json()['total'] == 1

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/knowledge/list?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_project_denied_403(self, client, auth_headers):
        r = client.get(f'/api/knowledge/list?project_id={ObjectId()}',
                       headers=auth_headers)
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# /search
# ---------------------------------------------------------------------------

class TestSearch:
    def test_missing_query_400(self, client, auth_headers):
        r = client.get('/api/knowledge/search', headers=auth_headers)
        assert r.status_code == 400

    def test_long_query_400(self, client, auth_headers):
        r = client.get(f'/api/knowledge/search?q={"x" * 201}', headers=auth_headers)
        assert r.status_code == 400

    def test_personal_scope_search_returns_owned(self, app, db, client, test_user, auth_headers):
        """Owner sees their personal-scope items in search."""
        with app.app_context():
            KnowledgeItemModel.get_collection().drop_indexes()
            KnowledgeItemModel.create_indexes()
            KnowledgeItemModel.create(test_user['_id'], 'chat',
                                       str(ObjectId()), str(ObjectId()),
                                       title='banana note',
                                       content='banana ripe')
        r = client.get('/api/knowledge/search?q=banana', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['total'] == 1

    def test_search_excludes_inaccessible_project_items(
        self, app, db, client, test_user, auth_headers,
    ):
        """Bug 1 fix: items the user originally authored under a project they
        no longer have access to must NOT appear in search hits. Mirrors the
        per-item ``GET /knowledge/<id>`` ACL.
        """
        with app.app_context():
            KnowledgeItemModel.get_collection().drop_indexes()
            KnowledgeItemModel.create_indexes()
            # Authored under some project the user is NOT a member of.
            orphan_pid = ObjectId()
            KnowledgeItemModel.create(
                test_user['_id'], 'chat', str(ObjectId()), str(ObjectId()),
                title='banana note',
                content='banana ripe',
                project_id=orphan_pid,
            )
        r = client.get('/api/knowledge/search?q=banana', headers=auth_headers)
        assert r.status_code == 200
        # Pre-fix: total=1 (cross-project leak). Post-fix: total=0.
        assert r.get_json()['total'] == 0


# ---------------------------------------------------------------------------
# /tags
# ---------------------------------------------------------------------------

class TestTags:
    def test_returns_sorted_tags(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            KnowledgeItemModel.create(test_user['_id'], 'chat',
                                      str(ObjectId()), str(ObjectId()),
                                      tags=['z', 'a'])
        r = client.get('/api/knowledge/tags', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['tags'] == ['a', 'z']


# ---------------------------------------------------------------------------
# Get single item
# ---------------------------------------------------------------------------

class TestGetItem:
    def test_invalid_id_400(self, client, auth_headers):
        r = client.get('/api/knowledge/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_missing_404(self, client, auth_headers):
        r = client.get(f'/api/knowledge/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(ObjectId(), 'chat',
                                            str(ObjectId()), str(ObjectId()))
        r = client.get(f"/api/knowledge/{it['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_returns_item(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()),
                                            content='c', title='T')
        r = client.get(f"/api/knowledge/{it['_id']}", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['item']['title'] == 'T'


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

class TestCreate:
    def _valid_chat(self):
        return {
            'source_type': 'chat',
            'source_id': str(ObjectId()),
            'message_id': str(ObjectId()),
            'content': 'hi',
            'title': 'T',
        }

    def test_invalid_source_type(self, client, auth_headers):
        body = self._valid_chat()
        body['source_type'] = 'bogus'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_workflow_missing_workflow_id(self, client, auth_headers):
        r = client.post('/api/knowledge', json={
            'source_type': 'workflow', 'content': 'c', 'title': 't',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_workflow_missing_node_id(self, client, auth_headers):
        r = client.post('/api/knowledge', json={
            'source_type': 'workflow', 'workflow_id': str(ObjectId()),
            'content': 'c', 'title': 't',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_chat_invalid_source_id(self, client, auth_headers):
        body = self._valid_chat()
        body['source_id'] = 'bad'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_chat_invalid_message_id(self, client, auth_headers):
        body = self._valid_chat()
        body['message_id'] = 'bad'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_blank_content_400(self, client, auth_headers):
        body = self._valid_chat()
        body['content'] = '  '
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_long_content_400(self, client, auth_headers):
        body = self._valid_chat()
        body['content'] = 'x' * 50001
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_blank_title_400(self, client, auth_headers):
        body = self._valid_chat()
        body['title'] = ''
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_long_title_400(self, client, auth_headers):
        body = self._valid_chat()
        body['title'] = 'x' * 201
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_tags_not_array_400(self, client, auth_headers):
        body = self._valid_chat()
        body['tags'] = 'a,b'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_create_ok(self, client, test_user, auth_headers):
        r = client.post('/api/knowledge', json=self._valid_chat(), headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['item']['title'] == 'T'

    def test_invalid_project_id_400(self, client, auth_headers):
        body = self._valid_chat()
        body['project_id'] = 'bad'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_403(self, client, auth_headers):
        body = self._valid_chat()
        body['project_id'] = str(ObjectId())
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 403

    def test_invalid_workspace_id_400(self, client, auth_headers):
        body = self._valid_chat()
        body['workspace_id'] = 'bad'
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        assert r.status_code == 400

    def test_tags_dedup_lowercase_clipped(self, client, test_user, auth_headers):
        body = self._valid_chat()
        body['tags'] = ['  A  ', 'b', 'a', 'b']
        r = client.post('/api/knowledge', json=body, headers=auth_headers)
        tags = set(r.get_json()['item']['tags'])
        assert tags == {'a', 'b'}


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

class TestUpdate:
    def _make_item(self, app, uid):
        with app.app_context():
            return KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))

    def test_invalid_id_400(self, client, auth_headers):
        r = client.put('/api/knowledge/bad', json={'title': 'X'}, headers=auth_headers)
        assert r.status_code == 400

    def test_project_id_rejected_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'project_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 400
        assert r.get_json()['code'] == 'cannot_reassign_project'

    def test_blank_title_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'title': ''}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_title_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'title': 'x' * 201}, headers=auth_headers)
        assert r.status_code == 400

    def test_tags_not_array(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'tags': 'x'}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_notes_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'notes': 'x' * 5001}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_folder_id_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'folder_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_no_valid_fields_400(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'mystery': 'x'}, headers=auth_headers)
        assert r.status_code == 400

    def test_success_updates_fields(self, app, db, client, test_user, auth_headers):
        it = self._make_item(app, test_user['_id'])
        r = client.put(f"/api/knowledge/{it['_id']}", json={
            'title': 'New', 'tags': ['X'], 'notes': 'n', 'is_favorite': True,
        }, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['item']
        assert body['title'] == 'New'
        assert body['tags'] == ['x']
        assert body['notes'] == 'n'
        assert body['is_favorite'] is True

    def test_not_owned_404(self, app, db, client, auth_headers):
        it = self._make_item(app, ObjectId())
        r = client.put(f"/api/knowledge/{it['_id']}",
                       json={'title': 'X'}, headers=auth_headers)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class TestDelete:
    def test_invalid_id_400(self, client, auth_headers):
        r = client.delete('/api/knowledge/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_missing_404(self, client, auth_headers):
        r = client.delete(f'/api/knowledge/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_owned_delete(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()))
        r = client.delete(f"/api/knowledge/{it['_id']}", headers=auth_headers)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# /move
# ---------------------------------------------------------------------------

class TestMove:
    def test_missing_item_ids_400(self, client, auth_headers):
        r = client.put('/api/knowledge/move', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_item_id_400(self, client, auth_headers):
        r = client.put('/api/knowledge/move',
                       json={'item_ids': ['bad']}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_folder_id_400(self, client, auth_headers):
        r = client.put('/api/knowledge/move', json={
            'item_ids': [str(ObjectId())], 'folder_id': 'bad',
        }, headers=auth_headers)
        assert r.status_code == 400

    def test_target_folder_missing_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()))
        r = client.put('/api/knowledge/move', json={
            'item_ids': [str(it['_id'])], 'folder_id': str(ObjectId()),
        }, headers=auth_headers)
        assert r.status_code == 404

    def test_item_not_owned_404(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            it = KnowledgeItemModel.create(ObjectId(), 'chat',
                                            str(ObjectId()), str(ObjectId()))
        r = client.put('/api/knowledge/move',
                       json={'item_ids': [str(it['_id'])]}, headers=auth_headers)
        assert r.status_code == 404

    def test_move_to_root_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            f = KnowledgeFolderModel.create(test_user['_id'], 'F')
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()),
                                            folder_id=str(f['_id']))
        r = client.put('/api/knowledge/move',
                       json={'item_ids': [str(it['_id'])], 'folder_id': None},
                       headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['moved_count'] == 1

    def test_move_to_folder_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            f = KnowledgeFolderModel.create(test_user['_id'], 'F')
            it = KnowledgeItemModel.create(test_user['_id'], 'chat',
                                            str(ObjectId()), str(ObjectId()))
        r = client.put('/api/knowledge/move', json={
            'item_ids': [str(it['_id'])], 'folder_id': str(f['_id']),
        }, headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            assert KnowledgeItemModel.find_by_id(it['_id'])['folder_id'] == f['_id']
