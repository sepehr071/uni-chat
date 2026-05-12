"""Tests for app/models/arena_session.py, arena_message.py, debate_session.py, debate_message.py."""

import pytest
from bson import ObjectId

from app.models.arena_message import ArenaMessageModel
from app.models.arena_session import ArenaSessionModel
from app.models.debate_message import DebateMessageModel
from app.models.debate_session import DebateSessionModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


# ---------------------------------------------------------------------------
# ArenaSession + ArenaMessage
# ---------------------------------------------------------------------------

class TestArenaSession:
    def test_create_and_find(self, app, db, uid):
        s = ArenaSessionModel.create(str(uid), [str(ObjectId()), str(ObjectId())],
                                       title='Battle')
        assert s['title'] == 'Battle'
        assert ArenaSessionModel.find_by_id(s['_id'])['_id'] == s['_id']

    def test_find_by_user_pagination(self, app, db, uid):
        for _ in range(3):
            ArenaSessionModel.create(str(uid), [str(ObjectId()), str(ObjectId())])
        out = ArenaSessionModel.find_by_user(str(uid), skip=0, limit=2)
        assert len(out) == 2

    def test_update_and_delete(self, app, db, uid):
        s = ArenaSessionModel.create(str(uid), [str(ObjectId()), str(ObjectId())])
        ArenaSessionModel.update(s['_id'], {'title': 'New'})
        assert ArenaSessionModel.find_by_id(s['_id'])['title'] == 'New'
        ArenaSessionModel.delete(s['_id'])
        assert ArenaSessionModel.find_by_id(s['_id']) is None


class TestArenaMessage:
    def test_create_and_find(self, app, db, uid):
        sess_id = ObjectId()
        cfg_id = ObjectId()
        m = ArenaMessageModel.create(str(sess_id), 'assistant', 'hi',
                                       config_id=str(cfg_id))
        assert m['role'] == 'assistant'
        msgs = ArenaMessageModel.find_by_session(str(sess_id))
        assert len(msgs) == 1

    def test_find_by_session_and_config(self, app, db, uid):
        sess_id = ObjectId()
        a = ObjectId()
        b = ObjectId()
        ArenaMessageModel.create(str(sess_id), 'assistant', 'A', config_id=str(a))
        ArenaMessageModel.create(str(sess_id), 'assistant', 'B', config_id=str(b))
        only_a = ArenaMessageModel.find_by_session_and_config(str(sess_id), str(a))
        assert len(only_a) == 1

    def test_delete_by_session(self, app, db, uid):
        sess_id = ObjectId()
        ArenaMessageModel.create(str(sess_id), 'user', 'x')
        ArenaMessageModel.create(str(sess_id), 'assistant', 'y',
                                  config_id=str(ObjectId()))
        ArenaMessageModel.delete_by_session(str(sess_id))
        assert ArenaMessageModel.find_by_session(str(sess_id)) == []


# ---------------------------------------------------------------------------
# DebateSession + DebateMessage
# ---------------------------------------------------------------------------

class TestDebateSession:
    def test_create_basic(self, app, db, uid):
        s = DebateSessionModel.create(
            user_id=str(uid), topic='T',
            config_ids=['quick:m1', 'quick:m2'],
            judge_config_id='quick:m3', rounds=2, max_tokens=500,
        )
        assert s['topic'] == 'T'
        assert s['settings']['rounds'] == 2

    def test_find_by_user_pagination(self, app, db, uid):
        for _ in range(3):
            DebateSessionModel.create(user_id=str(uid), topic='T',
                                        config_ids=['quick:m1', 'quick:m2'],
                                        judge_config_id='quick:m3',
                                        rounds=1, max_tokens=500)
        out = DebateSessionModel.find_by_user(str(uid), page=1, limit=2)
        assert len(out) == 2
        assert DebateSessionModel.count_by_user(str(uid)) == 3

    def test_status_and_verdict(self, app, db, uid):
        s = DebateSessionModel.create(user_id=str(uid), topic='T',
                                        config_ids=['quick:m1', 'quick:m2'],
                                        judge_config_id='quick:m3',
                                        rounds=1, max_tokens=500)
        DebateSessionModel.update_status(s['_id'], 'completed', current_round=2)
        DebateSessionModel.set_verdict(s['_id'], 'verdict text')
        refreshed = DebateSessionModel.find_by_id(s['_id'])
        assert refreshed['status'] == 'completed'
        assert refreshed['current_round'] == 2
        assert refreshed['final_verdict'] == 'verdict text'

    def test_delete(self, app, db, uid):
        s = DebateSessionModel.create(user_id=str(uid), topic='T',
                                        config_ids=['quick:m1', 'quick:m2'],
                                        judge_config_id='quick:m3',
                                        rounds=1, max_tokens=500)
        assert DebateSessionModel.delete(s['_id'], str(uid)) is True

    def test_delete_not_owned(self, app, db, uid):
        s = DebateSessionModel.create(user_id=str(uid), topic='T',
                                        config_ids=['quick:m1', 'quick:m2'],
                                        judge_config_id='quick:m3',
                                        rounds=1, max_tokens=500)
        assert DebateSessionModel.delete(s['_id'], str(ObjectId())) is False


class TestDebateMessage:
    def test_create_quick_model(self, app, db, uid):
        sess = ObjectId()
        m = DebateMessageModel.create(str(sess), 1, 'quick:m1', 'debater',
                                        'argued', order_in_round=0)
        assert m['config_id'] == 'quick:m1'

    def test_create_real_config(self, app, db, uid):
        sess = ObjectId()
        cfg = ObjectId()
        m = DebateMessageModel.create(str(sess), 1, str(cfg), 'judge',
                                        'verdict', order_in_round=1)
        assert m['config_id'] == cfg

    def test_find_by_session(self, app, db, uid):
        sess = ObjectId()
        DebateMessageModel.create(str(sess), 1, 'quick:m', 'debater', 'a',
                                    order_in_round=0)
        DebateMessageModel.create(str(sess), 1, 'quick:m', 'debater', 'b',
                                    order_in_round=1)
        out = DebateMessageModel.find_by_session(str(sess))
        assert len(out) == 2

    def test_find_by_session_and_round(self, app, db, uid):
        sess = ObjectId()
        DebateMessageModel.create(str(sess), 1, 'quick:m', 'debater', 'a',
                                    order_in_round=0)
        DebateMessageModel.create(str(sess), 2, 'quick:m', 'debater', 'b',
                                    order_in_round=0)
        out = DebateMessageModel.find_by_session_and_round(str(sess), 1)
        assert len(out) == 1

    def test_update_content(self, app, db, uid):
        sess = ObjectId()
        m = DebateMessageModel.create(str(sess), 1, 'quick:m', 'debater', 'old',
                                        order_in_round=0)
        DebateMessageModel.update_content(m['_id'], 'new')
        out = DebateMessageModel.find_by_session(str(sess))
        assert out[0]['content'] == 'new'

    def test_delete_by_session(self, app, db, uid):
        sess = ObjectId()
        DebateMessageModel.create(str(sess), 1, 'quick:m', 'debater', 'x',
                                    order_in_round=0)
        n = DebateMessageModel.delete_by_session(str(sess))
        assert n == 1
        assert DebateMessageModel.find_by_session(str(sess)) == []
