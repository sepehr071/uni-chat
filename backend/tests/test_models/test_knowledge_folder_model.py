"""Tests for app/models/knowledge_folder.py."""

import pytest
from bson import ObjectId

from app.models.knowledge_folder import KnowledgeFolderModel, NULL_PROJECT_SENTINEL


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestCreate:
    def test_basic(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'Bookmarks')
        assert f['name'] == 'Bookmarks'
        assert f['order'] == 0
        assert f['project_id'] is None
        assert f['scope_key'] == f'u:{uid}'

    def test_name_truncated_to_100(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'x' * 200)
        assert len(f['name']) == 100

    def test_project_scope_key(self, app, db, uid):
        # P1.25: project-scoped folders are keyed as ``p:<oid>`` (mirrors the
        # ``u:<oid>`` shape for user-scoped folders) so the two namespaces
        # are visually distinct in raw collection data and cannot collide
        # by a hex-only coincidence.
        proj = ObjectId()
        f = KnowledgeFolderModel.create(uid, 'A', project_id=str(proj))
        assert f['scope_key'] == f'p:{proj}'
        assert f['project_id'] == proj

    def test_order_increments(self, app, db, uid):
        a = KnowledgeFolderModel.create(uid, 'A')
        b = KnowledgeFolderModel.create(uid, 'B')
        assert b['order'] == a['order'] + 1


class TestFind:
    def test_by_user_no_filter(self, app, db, uid):
        KnowledgeFolderModel.create(uid, 'A')
        KnowledgeFolderModel.create(uid, 'B', project_id=ObjectId())
        out = KnowledgeFolderModel.find_by_user(uid)
        assert len(out) == 2

    def test_by_user_null_sentinel(self, app, db, uid):
        KnowledgeFolderModel.create(uid, 'A')
        KnowledgeFolderModel.create(uid, 'B', project_id=ObjectId())
        out = KnowledgeFolderModel.find_by_user(uid, project_id=NULL_PROJECT_SENTINEL)
        assert len(out) == 1
        assert out[0]['name'] == 'A'

    def test_by_user_null_string_alias(self, app, db, uid):
        KnowledgeFolderModel.create(uid, 'A')
        out = KnowledgeFolderModel.find_by_user(uid, project_id='null')
        assert len(out) == 1

    def test_by_user_specific_project(self, app, db, uid):
        proj = ObjectId()
        KnowledgeFolderModel.create(uid, 'A', project_id=proj)
        KnowledgeFolderModel.create(uid, 'B')
        out = KnowledgeFolderModel.find_by_user(uid, project_id=str(proj))
        assert len(out) == 1
        assert out[0]['name'] == 'A'

    def test_find_by_id(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        assert KnowledgeFolderModel.find_by_id(str(f['_id']))['_id'] == f['_id']

    def test_exists(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        assert KnowledgeFolderModel.exists(f['_id'], uid) is True
        other = ObjectId()
        assert KnowledgeFolderModel.exists(f['_id'], other) is False


class TestUpdate:
    def test_update_name(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        ok = KnowledgeFolderModel.update(f['_id'], uid, {'name': 'B'})
        assert ok is True
        assert KnowledgeFolderModel.find_by_id(f['_id'])['name'] == 'B'

    def test_update_color(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        KnowledgeFolderModel.update(f['_id'], uid, {'color': '#abcdef'})
        assert KnowledgeFolderModel.find_by_id(f['_id'])['color'] == '#abcdef'

    def test_update_truncates_name(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        KnowledgeFolderModel.update(f['_id'], uid, {'name': 'y' * 200})
        assert len(KnowledgeFolderModel.find_by_id(f['_id'])['name']) == 100

    def test_update_rejects_project_id(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        with pytest.raises(ValueError, match='cannot_reassign_project'):
            KnowledgeFolderModel.update(f['_id'], uid, {'project_id': ObjectId()})

    def test_update_duplicate_name_rejected(self, app, db, uid):
        a = KnowledgeFolderModel.create(uid, 'A')
        b = KnowledgeFolderModel.create(uid, 'B')
        with pytest.raises(ValueError, match='duplicate_name'):
            KnowledgeFolderModel.update(b['_id'], uid, {'name': 'A'})

    def test_update_unknown_field_no_op(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        ok = KnowledgeFolderModel.update(f['_id'], uid, {'frobnicate': True})
        assert ok is False

    def test_update_not_owned_no_op(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        ok = KnowledgeFolderModel.update(f['_id'], ObjectId(), {'name': 'X'})
        assert ok is False


class TestDeleteReorderCount:
    def test_delete_clears_items_folder_id(self, app, db, uid):
        from app.models.knowledge_item import KnowledgeItemModel
        f = KnowledgeFolderModel.create(uid, 'A')
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                       content='x', folder_id=str(f['_id']))
        ok = KnowledgeFolderModel.delete(f['_id'], uid)
        assert ok is True
        refreshed = KnowledgeItemModel.find_by_id(it['_id'])
        assert refreshed['folder_id'] is None

    def test_delete_not_owned(self, app, db, uid):
        f = KnowledgeFolderModel.create(uid, 'A')
        ok = KnowledgeFolderModel.delete(f['_id'], ObjectId())
        assert ok is False

    def test_reorder_updates_order(self, app, db, uid):
        a = KnowledgeFolderModel.create(uid, 'A')
        b = KnowledgeFolderModel.create(uid, 'B')
        KnowledgeFolderModel.reorder(uid, [
            {'folder_id': str(a['_id']), 'order': 9},
            {'folder_id': str(b['_id']), 'order': 1},
        ])
        assert KnowledgeFolderModel.find_by_id(a['_id'])['order'] == 9
        assert KnowledgeFolderModel.find_by_id(b['_id'])['order'] == 1

    def test_count_by_user(self, app, db, uid):
        KnowledgeFolderModel.create(uid, 'A')
        KnowledgeFolderModel.create(uid, 'B')
        assert KnowledgeFolderModel.count_by_user(uid) == 2
