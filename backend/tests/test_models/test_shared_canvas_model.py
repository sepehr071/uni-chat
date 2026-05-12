"""Tests for app/models/shared_canvas.py."""

import pytest
from bson import ObjectId

from app.models.shared_canvas import SharedCanvasModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestSharedCanvas:
    def test_create(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'T', '<p>x</p>', 'body{}',
                                       'console.log(1)')
        assert c['title'] == 'T'
        assert c['stats']['views'] == 0
        assert c['stats']['forks'] == 0
        assert len(c['share_id']) > 0

    def test_find_by_id_and_share_id(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'T', '<p>x</p>', '', '')
        assert SharedCanvasModel.find_by_id(c['_id'])['_id'] == c['_id']
        assert SharedCanvasModel.find_by_share_id(c['share_id'])['_id'] == c['_id']

    def test_find_by_owner_and_count(self, app, db, uid):
        SharedCanvasModel.create(str(uid), 'A', '', '', '')
        SharedCanvasModel.create(str(uid), 'B', '', '', '')
        out = SharedCanvasModel.find_by_owner(str(uid))
        assert len(out) == 2
        assert SharedCanvasModel.count_by_owner(str(uid)) == 2

    def test_update(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'A', '', '', '')
        r = SharedCanvasModel.update(c['share_id'], str(uid), {'title': 'B'})
        assert r.modified_count == 1
        refreshed = SharedCanvasModel.find_by_share_id(c['share_id'])
        assert refreshed['title'] == 'B'

    def test_update_not_owned(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'A', '', '', '')
        r = SharedCanvasModel.update(c['share_id'], str(ObjectId()), {'title': 'B'})
        assert r.modified_count == 0

    def test_increment_views_and_forks(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'A', '', '', '')
        SharedCanvasModel.increment_views(c['share_id'])
        SharedCanvasModel.increment_forks(c['share_id'])
        refreshed = SharedCanvasModel.find_by_share_id(c['share_id'])
        assert refreshed['stats']['views'] == 1
        assert refreshed['stats']['forks'] == 1

    def test_delete(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'A', '', '', '')
        r = SharedCanvasModel.delete(c['share_id'], str(uid))
        assert r.deleted_count == 1

    def test_delete_not_owned(self, app, db, uid):
        c = SharedCanvasModel.create(str(uid), 'A', '', '', '')
        r = SharedCanvasModel.delete(c['share_id'], str(ObjectId()))
        assert r.deleted_count == 0
