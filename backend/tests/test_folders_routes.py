"""Tests for app/routes/folders.py."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.folder import FolderModel


class TestListAndTree:
    def test_get_empty(self, client, test_user, auth_headers):
        r = client.get('/api/folders', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['folders'] == []

    def test_get_returns_user_folders(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            FolderModel.create(str(test_user['_id']), 'Box')
        r = client.get('/api/folders', headers=auth_headers)
        assert r.status_code == 200
        assert len(r.get_json()['folders']) == 1

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.get('/api/folders?project_id=bad', headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_returns_403(self, client, auth_headers):
        r = client.get(f'/api/folders?project_id={ObjectId()}', headers=auth_headers)
        assert r.status_code == 403

    def test_tree_structure(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            uid = str(test_user['_id'])
            root = FolderModel.create(uid, 'Root')
            FolderModel.create(uid, 'Child', parent_id=str(root['_id']))
        r = client.get('/api/folders/tree', headers=auth_headers)
        assert r.status_code == 200
        tree = r.get_json()['tree']
        assert len(tree) == 1
        assert tree[0]['name'] == 'Root'
        assert tree[0]['children'][0]['name'] == 'Child'


class TestCreate:
    def test_create_minimal(self, client, test_user, auth_headers):
        r = client.post('/api/folders', json={'name': 'Inbox'}, headers=auth_headers)
        assert r.status_code == 201
        assert r.get_json()['folder']['name'] == 'Inbox'

    def test_blank_name_400(self, client, auth_headers):
        r = client.post('/api/folders', json={'name': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_too_long_name_400(self, client, auth_headers):
        r = client.post('/api/folders', json={'name': 'x' * 101}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_project_id_400(self, client, auth_headers):
        r = client.post('/api/folders',
                        json={'name': 'X', 'project_id': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_project_access_denied_403(self, client, auth_headers):
        r = client.post('/api/folders',
                        json={'name': 'X', 'project_id': str(ObjectId())},
                        headers=auth_headers)
        assert r.status_code == 403


class TestGetUpdateDelete:
    def _make(self, app, test_user, name='F'):
        with app.app_context():
            return FolderModel.create(str(test_user['_id']), name)

    def test_get_404_when_other_user(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            f = FolderModel.create(str(ObjectId()), 'Other')
        r = client.get(f"/api/folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_returns_folder_and_convs(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.get(f"/api/folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data['folder']['name'] == 'F'
        assert 'conversations' in data

    def test_update_name(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.put(f"/api/folders/{f['_id']}",
                       json={'name': 'Renamed'}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['folder']['name'] == 'Renamed'

    def test_update_blank_name_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.put(f"/api/folders/{f['_id']}",
                       json={'name': '  '}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_long_name_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.put(f"/api/folders/{f['_id']}",
                       json={'name': 'x' * 101}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_parent(self, app, db, client, test_user, auth_headers):
        a = self._make(app, test_user, 'A')
        b = self._make(app, test_user, 'B')
        r = client.put(f"/api/folders/{b['_id']}",
                       json={'parent_id': str(a['_id'])}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['folder']['parent_id'] == str(a['_id'])

    def test_update_parent_self_400(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.put(f"/api/folders/{f['_id']}",
                       json={'parent_id': str(f['_id'])}, headers=auth_headers)
        assert r.status_code == 400

    def test_update_parent_missing_404(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.put(f"/api/folders/{f['_id']}",
                       json={'parent_id': str(ObjectId())}, headers=auth_headers)
        assert r.status_code == 404

    def test_delete(self, app, db, client, test_user, auth_headers):
        f = self._make(app, test_user)
        r = client.delete(f"/api/folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            assert FolderModel.find_by_id(f['_id']) is None

    def test_delete_other_user_404(self, app, db, client, auth_headers):
        with app.app_context():
            f = FolderModel.create(str(ObjectId()), 'Other')
        r = client.delete(f"/api/folders/{f['_id']}", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_moves_children_and_convs_to_root(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            uid = test_user['_id']
            parent = FolderModel.create(uid, 'P')
            child = FolderModel.create(uid, 'C', parent_id=parent['_id'])
            # Insert conv linked to the folder
            mongo.db.conversations.insert_one({
                'user_id': uid, 'folder_id': parent['_id'], 'title': 'x',
            })
        client.delete(f"/api/folders/{parent['_id']}", headers=auth_headers)
        with app.app_context():
            assert FolderModel.find_by_id(child['_id'])['parent_id'] is None
            conv = mongo.db.conversations.find_one({'title': 'x'})
            assert conv['folder_id'] is None


class TestReorder:
    def test_reorder_ok(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            uid = str(test_user['_id'])
            a = FolderModel.create(uid, 'A')
            b = FolderModel.create(uid, 'B')
        r = client.put('/api/folders/reorder', json={'orders': [
            {'id': str(a['_id']), 'order': 9},
            {'id': str(b['_id']), 'order': 1},
        ]}, headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            assert FolderModel.find_by_id(a['_id'])['order'] == 9

    def test_reorder_empty_400(self, client, auth_headers):
        r = client.put('/api/folders/reorder', json={'orders': []}, headers=auth_headers)
        assert r.status_code == 400
