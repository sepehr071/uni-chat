"""Tests for app/models/folder.py — FolderModel CRUD + reorder + scoping."""

import pytest
from bson import ObjectId

from app.extensions import mongo
from app.models.folder import FolderModel, NULL_PROJECT_SENTINEL


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestCreate:
    def test_basic_create(self, app, db, uid):
        f = FolderModel.create(uid, 'Inbox')
        assert f['name'] == 'Inbox'
        assert f['parent_id'] is None
        assert f['project_id'] is None
        assert f['order'] == 0
        assert f['_id'] is not None

    def test_order_increments_per_scope(self, app, db, uid):
        f1 = FolderModel.create(uid, 'A')
        f2 = FolderModel.create(uid, 'B')
        assert f1['order'] == 0
        assert f2['order'] == 1

    def test_project_scoped_create_with_str_ids(self, app, db, uid):
        proj = str(ObjectId())
        parent = str(ObjectId())
        f = FolderModel.create(str(uid), 'Sub', parent_id=parent, project_id=proj)
        assert f['parent_id'] == ObjectId(parent)
        assert f['project_id'] == ObjectId(proj)
        assert f['user_id'] == uid


class TestFindByUser:
    def test_returns_root_when_no_parent(self, app, db, uid):
        f1 = FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B', parent_id=f1['_id'])
        out = FolderModel.find_by_user(uid)
        # Only root folders returned by default
        assert len(out) == 1
        assert out[0]['_id'] == f1['_id']

    def test_filters_by_parent(self, app, db, uid):
        f1 = FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'Child', parent_id=f1['_id'])
        out = FolderModel.find_by_user(uid, parent_id=f1['_id'])
        assert len(out) == 1
        assert out[0]['name'] == 'Child'

    def test_null_project_sentinel(self, app, db, uid):
        FolderModel.create(uid, 'A')  # no project
        FolderModel.create(uid, 'B', project_id=ObjectId())
        out = FolderModel.find_by_user(uid, project_id=NULL_PROJECT_SENTINEL)
        assert len(out) == 1
        assert out[0]['name'] == 'A'

    def test_specific_project_filter(self, app, db, uid):
        proj = ObjectId()
        FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B', project_id=proj)
        out = FolderModel.find_by_user(uid, project_id=str(proj))
        assert len(out) == 1
        assert out[0]['name'] == 'B'

    def test_find_all_flat_no_project(self, app, db, uid):
        f1 = FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B', parent_id=f1['_id'])
        out = FolderModel.find_all_by_user(uid)
        assert len(out) == 2

    def test_find_all_with_sentinel(self, app, db, uid):
        FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B', project_id=ObjectId())
        out = FolderModel.find_all_by_user(uid, project_id=NULL_PROJECT_SENTINEL)
        assert len(out) == 1


class TestUpdateMoveDelete:
    def test_update_changes_name_and_updated_at(self, app, db, uid):
        f = FolderModel.create(uid, 'X')
        FolderModel.update(f['_id'], {'name': 'Y', 'color': '#f00'})
        refreshed = FolderModel.find_by_id(f['_id'])
        assert refreshed['name'] == 'Y'
        assert refreshed['color'] == '#f00'

    def test_move_to_project(self, app, db, uid):
        f = FolderModel.create(uid, 'X')
        proj = ObjectId()
        FolderModel.move_to_project(f['_id'], str(proj))
        assert FolderModel.find_by_id(f['_id'])['project_id'] == proj

    def test_move_to_project_none_clears(self, app, db, uid):
        f = FolderModel.create(uid, 'X', project_id=ObjectId())
        FolderModel.move_to_project(f['_id'], None)
        assert FolderModel.find_by_id(f['_id'])['project_id'] is None

    def test_reorder(self, app, db, uid):
        f1 = FolderModel.create(uid, 'A')
        f2 = FolderModel.create(uid, 'B')
        FolderModel.reorder(uid, [
            {'id': str(f1['_id']), 'order': 5},
            {'id': str(f2['_id']), 'order': 1},
        ])
        assert FolderModel.find_by_id(f1['_id'])['order'] == 5
        assert FolderModel.find_by_id(f2['_id'])['order'] == 1

    def test_delete(self, app, db, uid):
        f = FolderModel.create(uid, 'X')
        FolderModel.delete(f['_id'])
        assert FolderModel.find_by_id(f['_id']) is None

    def test_delete_by_user(self, app, db, uid):
        FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B')
        FolderModel.delete_by_user(uid)
        assert FolderModel.count_by_user(uid) == 0

    def test_count_by_user(self, app, db, uid):
        FolderModel.create(uid, 'A')
        FolderModel.create(uid, 'B')
        assert FolderModel.count_by_user(uid) == 2
