"""Tests for app/models/workflow.py + app/models/workflow_run.py."""

import pytest
from bson import ObjectId

from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


class TestWorkflowCRUD:
    def test_create_and_get(self, app, db, uid):
        wf_id = WorkflowModel.create(uid, 'WF', 'd', [], [],
                                       project_id=ObjectId(),
                                       workspace_id=ObjectId(),
                                       category='smm')
        doc = WorkflowModel.get_by_id(wf_id, str(uid))
        assert doc is not None
        assert doc['name'] == 'WF'
        assert doc['category'] == 'smm'

    def test_template_visible_without_user_check(self, app, db, uid):
        wf_id = WorkflowModel.create(None, 'T', '', [], [], is_template=True)
        # Owner is None but template flag makes it visible to any user
        assert WorkflowModel.get_by_id(wf_id, str(ObjectId())) is not None

    def test_get_by_user(self, app, db, uid):
        WorkflowModel.create(uid, 'A', '', [], [])
        WorkflowModel.create(uid, 'B', '', [], [])
        WorkflowModel.create(ObjectId(), 'C', '', [], [])  # other user
        out = WorkflowModel.get_by_user(uid)
        assert len(out) == 2

    def test_find_by_project(self, app, db, uid):
        proj = ObjectId()
        WorkflowModel.create(uid, 'A', '', [], [], project_id=proj)
        WorkflowModel.create(uid, 'B', '', [], [])
        out = WorkflowModel.find_by_project(str(proj))
        assert len(out) == 1

    def test_find_visible_to_with_project(self, app, db, uid):
        proj = ObjectId()
        WorkflowModel.create(uid, 'Mine', '', [], [])
        WorkflowModel.create(ObjectId(), 'OtherProj', '', [], [], project_id=proj)
        WorkflowModel.create(ObjectId(), 'OtherPersonal', '', [], [])
        out = WorkflowModel.find_visible_to(uid, project_id=str(proj))
        names = {w['name'] for w in out}
        assert 'Mine' in names and 'OtherProj' in names
        assert 'OtherPersonal' not in names

    def test_update(self, app, db, uid):
        wf_id = WorkflowModel.create(uid, 'WF', '', [], [])
        ok = WorkflowModel.update(wf_id, str(uid), {'name': 'New'})
        assert ok is True
        assert WorkflowModel.get_by_id(wf_id, str(uid))['name'] == 'New'

    def test_update_other_user_no_op(self, app, db, uid):
        wf_id = WorkflowModel.create(uid, 'WF', '', [], [])
        ok = WorkflowModel.update(wf_id, str(ObjectId()), {'name': 'X'})
        assert ok is False

    def test_delete(self, app, db, uid):
        wf_id = WorkflowModel.create(uid, 'WF', '', [], [])
        assert WorkflowModel.delete(wf_id, str(uid)) is True
        assert WorkflowModel.get_by_id(wf_id, str(uid)) is None

    def test_get_templates(self, app, db, uid):
        WorkflowModel.create(None, 'TplA', '', [], [], is_template=True)
        WorkflowModel.create(uid, 'Other', '', [], [])
        out = WorkflowModel.get_templates()
        assert len(out) == 1

    def test_duplicate(self, app, db, uid):
        src = WorkflowModel.create(uid, 'Orig', 'd', [], [])
        dup_id = WorkflowModel.duplicate(src, str(uid), new_name='Copy')
        dup = WorkflowModel.get_by_id(dup_id, str(uid))
        assert dup['name'] == 'Copy'

    def test_duplicate_default_name_suffix(self, app, db, uid):
        src = WorkflowModel.create(uid, 'Orig', '', [], [])
        dup_id = WorkflowModel.duplicate(src, str(uid))
        assert WorkflowModel.get_by_id(dup_id, str(uid))['name'] == 'Orig (Copy)'

    def test_duplicate_unknown_returns_none(self, app, db, uid):
        assert WorkflowModel.duplicate(str(ObjectId()), str(uid)) is None


class TestWorkflowRun:
    def test_create_and_get(self, app, db, uid):
        wf_id = ObjectId()
        run_id = WorkflowRunModel.create(str(wf_id), str(uid), 'full')
        run = WorkflowRunModel.get_by_id(run_id)
        assert run['status'] == 'running'
        assert run['execution_mode'] == 'full'

    def test_get_by_workflow(self, app, db, uid):
        wf_id = ObjectId()
        WorkflowRunModel.create(str(wf_id), str(uid), 'full')
        WorkflowRunModel.create(str(wf_id), str(uid), 'partial', start_node_id='n1')
        out = WorkflowRunModel.get_by_workflow(str(wf_id), str(uid))
        assert len(out) == 2

    def test_update_status_completed(self, app, db, uid):
        run_id = WorkflowRunModel.create(str(ObjectId()), str(uid), 'full')
        WorkflowRunModel.update_status(run_id, 'completed')
        run = WorkflowRunModel.get_by_id(run_id)
        assert run['status'] == 'completed'
        assert run['completed_at'] is not None

    def test_update_node_result_new(self, app, db, uid):
        run_id = WorkflowRunModel.create(str(ObjectId()), str(uid), 'full')
        WorkflowRunModel.update_node_result(run_id, 'n1', {
            'status': 'completed', 'text': 'hi',
        })
        assert WorkflowRunModel.get_node_result(run_id, 'n1')['text'] == 'hi'

    def test_update_node_result_update_existing(self, app, db, uid):
        run_id = WorkflowRunModel.create(str(ObjectId()), str(uid), 'full')
        WorkflowRunModel.update_node_result(run_id, 'n1', {'status': 'running'})
        WorkflowRunModel.update_node_result(run_id, 'n1', {'status': 'completed',
                                                            'generation_time_ms': 50})
        nr = WorkflowRunModel.get_node_result(run_id, 'n1')
        assert nr['status'] == 'completed'
        assert nr['generation_time_ms'] == 50

    def test_update_node_result_missing_run(self, app, db, uid):
        assert WorkflowRunModel.update_node_result(str(ObjectId()), 'n', {}) is False

    def test_get_node_result_missing(self, app, db, uid):
        run_id = WorkflowRunModel.create(str(ObjectId()), str(uid), 'full')
        assert WorkflowRunModel.get_node_result(run_id, 'missing') is None
