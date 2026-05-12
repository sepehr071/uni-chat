"""Tests for app/models/knowledge_item.py."""

import pytest
from bson import ObjectId

from app.models.knowledge_item import KnowledgeItemModel, NULL_PROJECT_SENTINEL


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestCreate:
    def test_chat_source(self, app, db, uid):
        conv = ObjectId()
        msg = ObjectId()
        it = KnowledgeItemModel.create(uid, 'chat', str(conv), str(msg),
                                       content='hi', title='T', tags=['a', 'b'])
        assert it['source']['type'] == 'chat'
        assert it['source']['conversation_id'] == conv
        assert it['source']['session_id'] is None
        assert it['source']['message_id'] == msg
        assert it['tags'] == ['a', 'b']
        assert it['is_favorite'] is False

    def test_arena_source(self, app, db, uid):
        sess = ObjectId()
        it = KnowledgeItemModel.create(uid, 'arena', str(sess), str(ObjectId()))
        assert it['source']['type'] == 'arena'
        assert it['source']['session_id'] == sess
        assert it['source']['conversation_id'] is None

    def test_debate_source(self, app, db, uid):
        sess = ObjectId()
        it = KnowledgeItemModel.create(uid, 'debate', str(sess), str(ObjectId()))
        assert it['source']['type'] == 'debate'
        assert it['source']['session_id'] == sess

    def test_workflow_source(self, app, db, uid):
        wid = ObjectId()
        it = KnowledgeItemModel.create(uid, 'workflow', None, None,
                                       content='out', workflow_id=str(wid),
                                       node_id='n1')
        assert it['source']['type'] == 'workflow'
        assert it['source']['workflow_id'] == wid
        assert it['source']['node_id'] == 'n1'

    def test_project_scope(self, app, db, uid):
        proj = ObjectId()
        ws = ObjectId()
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                       project_id=str(proj), workspace_id=str(ws))
        assert it['project_id'] == proj
        assert it['workspace_id'] == ws


class TestFind:
    def test_pagination_and_total(self, app, db, uid):
        for i in range(5):
            KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                      content=f'c{i}')
        items, total = KnowledgeItemModel.find_by_user(uid, page=1, limit=2)
        assert len(items) == 2
        assert total == 5

    def test_filter_by_tag(self, app, db, uid):
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()), tags=['a'])
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()), tags=['b'])
        items, total = KnowledgeItemModel.find_by_user(uid, tag='a')
        assert total == 1

    def test_favorite_only(self, app, db, uid):
        a = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        KnowledgeItemModel.update(a['_id'], uid, {'is_favorite': True})
        items, total = KnowledgeItemModel.find_by_user(uid, favorite_only=True)
        assert total == 1

    def test_filter_by_folder_root(self, app, db, uid):
        a = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        f = ObjectId()
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  folder_id=str(f))
        items, total = KnowledgeItemModel.find_by_user(uid, folder_id='root')
        assert total == 1
        assert items[0]['_id'] == a['_id']

    def test_filter_by_folder_specific(self, app, db, uid):
        f = ObjectId()
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  folder_id=str(f))
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        items, total = KnowledgeItemModel.find_by_user(uid, folder_id=str(f))
        assert total == 1

    def test_project_filter_null_sentinel(self, app, db, uid):
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  project_id=str(ObjectId()))
        items, total = KnowledgeItemModel.find_by_user(uid, project_id=NULL_PROJECT_SENTINEL)
        assert total == 1

    def test_project_filter_specific(self, app, db, uid):
        proj = ObjectId()
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  project_id=proj)
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        items, total = KnowledgeItemModel.find_by_user(uid, project_id=str(proj))
        assert total == 1


class TestUpdate:
    def test_allowed_fields_updated(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        ok = KnowledgeItemModel.update(it['_id'], uid, {
            'title': 'New', 'tags': ['x'], 'notes': 'n', 'is_favorite': True,
        })
        assert ok is True
        refreshed = KnowledgeItemModel.find_by_id(it['_id'])
        assert refreshed['title'] == 'New'
        assert refreshed['tags'] == ['x']
        assert refreshed['notes'] == 'n'
        assert refreshed['is_favorite'] is True

    def test_folder_id_update(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        f = ObjectId()
        KnowledgeItemModel.update(it['_id'], uid, {'folder_id': str(f)})
        assert KnowledgeItemModel.find_by_id(it['_id'])['folder_id'] == f

    def test_folder_id_cleared(self, app, db, uid):
        f = ObjectId()
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                       folder_id=str(f))
        KnowledgeItemModel.update(it['_id'], uid, {'folder_id': None})
        assert KnowledgeItemModel.find_by_id(it['_id'])['folder_id'] is None

    def test_project_id_rejected(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        with pytest.raises(ValueError, match='cannot_reassign_project'):
            KnowledgeItemModel.update(it['_id'], uid, {'project_id': ObjectId()})

    def test_unknown_field_no_op(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        ok = KnowledgeItemModel.update(it['_id'], uid, {'mystery': 'no'})
        assert ok is False


class TestDeleteAndCount:
    def test_delete_owned(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        assert KnowledgeItemModel.delete(it['_id'], uid) is True
        assert KnowledgeItemModel.find_by_id(it['_id']) is None

    def test_delete_not_owned(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        assert KnowledgeItemModel.delete(it['_id'], ObjectId()) is False

    def test_count_by_user(self, app, db, uid):
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        assert KnowledgeItemModel.count_by_user(uid) == 2

    def test_count_by_folder_root(self, app, db, uid):
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  folder_id=str(ObjectId()))
        assert KnowledgeItemModel.count_by_folder(uid, 'root') == 1

    def test_count_by_folder_specific(self, app, db, uid):
        f = ObjectId()
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                  folder_id=str(f))
        assert KnowledgeItemModel.count_by_folder(uid, str(f)) == 1

    def test_user_tags_distinct(self, app, db, uid):
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()), tags=['a', 'b'])
        KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()), tags=['b', 'c'])
        tags = set(KnowledgeItemModel.get_user_tags(uid))
        assert tags == {'a', 'b', 'c'}


class TestMoveToFolder:
    def test_move_to_target_folder(self, app, db, uid):
        a = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        b = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        target = ObjectId()
        n = KnowledgeItemModel.move_to_folder([str(a['_id']), str(b['_id'])],
                                               uid, folder_id=str(target))
        assert n == 2
        assert KnowledgeItemModel.find_by_id(a['_id'])['folder_id'] == target

    def test_move_to_root_clears_folder(self, app, db, uid):
        f = ObjectId()
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                        folder_id=str(f))
        n = KnowledgeItemModel.move_to_folder([str(it['_id'])], uid, folder_id=None)
        assert n == 1
        assert KnowledgeItemModel.find_by_id(it['_id'])['folder_id'] is None

    def test_sync_project_overrides(self, app, db, uid):
        proj_old = ObjectId()
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                       project_id=proj_old)
        proj_new = ObjectId()
        ws_new = ObjectId()
        KnowledgeItemModel.move_to_folder([str(it['_id'])], uid,
                                          folder_id=None, sync_project=True,
                                          project_id=str(proj_new),
                                          workspace_id=str(ws_new))
        refreshed = KnowledgeItemModel.find_by_id(it['_id'])
        assert refreshed['project_id'] == proj_new
        assert refreshed['workspace_id'] == ws_new

    def test_sync_project_to_null(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()),
                                       project_id=ObjectId(), workspace_id=ObjectId())
        KnowledgeItemModel.move_to_folder([str(it['_id'])], uid,
                                          folder_id=None, sync_project=True,
                                          project_id=None, workspace_id=None)
        refreshed = KnowledgeItemModel.find_by_id(it['_id'])
        assert refreshed['project_id'] is None
        assert refreshed['workspace_id'] is None

    def test_move_not_owned_does_nothing(self, app, db, uid):
        it = KnowledgeItemModel.create(uid, 'chat', str(ObjectId()), str(ObjectId()))
        other = ObjectId()
        n = KnowledgeItemModel.move_to_folder([str(it['_id'])], other,
                                              folder_id=str(ObjectId()))
        assert n == 0
