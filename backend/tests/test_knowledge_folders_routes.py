"""Tests for app/routes/knowledge_folders.py."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.knowledge_folder import KnowledgeFolderModel
from app.models.knowledge_item import KnowledgeItemModel


class TestList:
    def test_empty(self, client, test_user, auth_headers):
        r = client.get('/api/knowledge-folders', headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['folders'] == []
        assert data['unfiled_count'] == 0

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/knowledge-folders?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied(self, client, auth_headers):
        r = client.get(f'/api/knowledge-folders?project_id={ObjectId()}',
                       headers=auth_headers)
        assert r.status_code == 403

    def test_returns_folder_with_item_count(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            uid = test_user['_id']
            f = KnowledgeFolderModel.create(uid, 'Box')
            KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                      folder_id=str(f['_id']))
            KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        r = client.get('/api/knowledge-folders', headers=auth_headers)
        data = r.get_json()
        assert len(data['folders']) == 1
        assert data['folders'][0]['item_count'] == 1
        assert data['unfiled_count'] == 1


class TestCreate:
    def test_create_basic(self, client, test_user, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'Notes'}, headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['folder']['name'] == 'Notes'

    def test_blank_name_400(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_long_name_400(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'x' * 101}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'A', 'project_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_no_project_access_403(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'A', 'project_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 403

    def test_invalid_workspace_id_400(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'A', 'workspace_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_duplicate_name_400(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            KnowledgeFolderModel.create(test_user['_id'], 'Box')
        r = client.post('/api/knowledge-folders',
                        json={'name': 'box'}, headers=auth_headers)
        assert r.status_code == 400

    def test_color_falls_back_when_invalid(self, client, auth_headers):
        r = client.post('/api/knowledge-folders',
                        json={'name': 'A', 'color': 'not-a-hex'},
                        headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['folder']['color'] == '#5c9aed'


class TestGetUpdateDelete:
    def _make(self, app, uid, name='F'):
        with app.app_context():
            return KnowledgeFolderModel.create(uid, name)

    def test_get_invalid_id_400(self, client, auth_headers):
        r = client.get('/api/knowledge-folders/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_get_missing_404(self, client, auth_headers):
        r = client.get(f'/api/knowledge-folders/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_get_other_user_404(self, app, db, client, auth_headers):
        f = self._make(app, ObjectId())
        r = client.get(f"/api/knowledge-folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_with_count(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.get(f"/api/knowledge-folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['folder']['item_count'] == 0

    def test_update_invalid_id_400(self, client, auth_headers):
        r = client.put('/api/knowledge-folders/bad', json={'name': 'X'}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_project_id_rejected_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'project_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 400
        assert r.get_json()['code'] == 'cannot_reassign_project'

    def test_update_blank_name_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_long_name_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'name': 'x' * 101}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_no_valid_fields_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'mystery': True}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_success(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'name': 'New', 'color': '#abcdef'},
                       headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['folder']
        assert body['name'] == 'New'
        assert body['color'] == '#abcdef'

    def test_update_duplicate_name_400(self, app, db, client, test_user, auth_headers):
        a = self._make(app, test_user['_id'], 'A')
        b = self._make(app, test_user['_id'], 'B')
        r = client.put(f"/api/knowledge-folders/{b['_id']}",
                       json={'name': 'A'}, headers=auth_headers)
        assert r.status_code == 400
        assert r.get_json()['code'] == 'duplicate_name'

    def test_update_not_owned_404(self, app, db, client, auth_headers):
        f = self._make(app, ObjectId())
        r = client.put(f"/api/knowledge-folders/{f['_id']}",
                       json={'name': 'X'}, headers=auth_headers)
        assert r.status_code == 404

    def test_delete_invalid_id_400(self, client, auth_headers):
        r = client.delete('/api/knowledge-folders/bad', headers=auth_headers)
        assert r.status_code == 400

    def test_delete_missing_404(self, client, auth_headers):
        r = client.delete(f'/api/knowledge-folders/{ObjectId()}', headers=auth_headers)
        assert r.status_code == 404

    def test_delete_success(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user['_id'])
        r = client.delete(f"/api/knowledge-folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 200


class TestReorder:
    def test_empty_400(self, client, auth_headers):
        r = client.put('/api/knowledge-folders/reorder',
                       json={'orders': []}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_folder_id_400(self, client, auth_headers):
        r = client.put('/api/knowledge-folders/reorder',
                       json={'orders': [{'folder_id': 'bad', 'order': 1}]},
                       headers=auth_headers)
        assert r.status_code == 400

    def test_order_must_be_int(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            f = KnowledgeFolderModel.create(test_user['_id'], 'A')
        r = client.put('/api/knowledge-folders/reorder',
                       json={'orders': [{'folder_id': str(f['_id']), 'order': '1'}]},
                       headers=auth_headers)
        assert r.status_code == 400

    def test_success(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            uid = test_user['_id']
            a = KnowledgeFolderModel.create(uid, 'A')
            b = KnowledgeFolderModel.create(uid, 'B')
        r = client.put('/api/knowledge-folders/reorder',
                       json={'orders': [
                           {'folder_id': str(a['_id']), 'order': 9},
                           {'folder_id': str(b['_id']), 'order': 1},
                       ]}, headers=auth_headers)
        assert r.status_code == 200
