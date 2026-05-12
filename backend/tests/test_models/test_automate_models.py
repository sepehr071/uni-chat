"""Tests for app/models/automate_task.py + app/models/automate_message.py."""

import pytest
from bson import ObjectId

from app.models.automate_message import AutomateMessageModel
from app.models.automate_task import AutomateTaskModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestAutomateTask:
    def test_create_and_find(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'go to site', 'gpt-4')
        doc = AutomateTaskModel.find_by_id(tid)
        assert doc['task_text'] == 'go to site'
        assert doc['model'] == 'gpt-4'
        assert doc['status'] == 'pending'

    def test_find_by_user_pagination(self, app, db, uid):
        AutomateTaskModel.create(str(uid), 'a', 'm')
        AutomateTaskModel.create(str(uid), 'b', 'm')
        AutomateTaskModel.create(str(ObjectId()), 'c', 'm')
        out = AutomateTaskModel.find_by_user(str(uid))
        assert len(out) == 2
        assert AutomateTaskModel.count_by_user(str(uid)) == 2

    def test_update_and_set_session(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'go', 'm')
        AutomateTaskModel.update(tid, {'task_text': 'new'})
        assert AutomateTaskModel.find_by_id(tid)['task_text'] == 'new'
        AutomateTaskModel.set_session(tid, 'sess-1', 'https://x/y')
        doc = AutomateTaskModel.find_by_id(tid)
        assert doc['session_id'] == 'sess-1'
        assert doc['live_url'] == 'https://x/y'

    def test_set_status(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        AutomateTaskModel.set_status(tid, 'completed', output='done')
        doc = AutomateTaskModel.find_by_id(tid)
        assert doc['status'] == 'completed'
        assert doc['output'] == 'done'

    def test_set_status_with_error(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        AutomateTaskModel.set_status(tid, 'error', error='boom')
        doc = AutomateTaskModel.find_by_id(tid)
        assert doc['status'] == 'error'
        assert doc['error'] == 'boom'

    def test_increment_message_count(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        AutomateTaskModel.increment_message_count(tid, 2)
        assert AutomateTaskModel.find_by_id(tid)['message_count'] == 2

    def test_delete(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        assert AutomateTaskModel.delete(tid, str(uid)) is True
        assert AutomateTaskModel.find_by_id(tid) is None

    def test_delete_not_owned(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        assert AutomateTaskModel.delete(tid, str(ObjectId())) is False


class TestAutomateMessage:
    def test_create_and_find(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        AutomateMessageModel.create(
            task_id=tid, cursor_id='c-1', role='agent',
            type='step', summary='thinking', data={'k': 'v'},
            screenshot_url='https://x/y.png',
        )
        msgs = AutomateMessageModel.find_by_task(tid)
        assert len(msgs) == 1
        assert msgs[0]['type'] == 'step'

    def test_delete_by_task(self, app, db, uid):
        tid = AutomateTaskModel.create(str(uid), 'g', 'm')
        AutomateMessageModel.create(task_id=tid, cursor_id='c-1', role='agent',
                                      type='step', summary='x', data=None,
                                      screenshot_url=None)
        AutomateMessageModel.create(task_id=tid, cursor_id='c-2', role='agent',
                                      type='step', summary='y', data=None,
                                      screenshot_url=None)
        n = AutomateMessageModel.delete_by_task(tid)
        assert n == 2
