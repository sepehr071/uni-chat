"""
Tests for migrate_collapse_roles.py.

Uses the real unichat_test MongoDB (same as conftest.py).
"""

import pytest
from bson import ObjectId
from pymongo import MongoClient


TEST_URI = 'mongodb://localhost:27017/unichat_test_migration'


@pytest.fixture(scope='module')
def mig_db():
    client = MongoClient(TEST_URI)
    db = client.get_database()
    yield db
    client.drop_database(db.name)
    client.close()


def _seed(db):
    """Insert legacy-role rows into all three collections."""
    db['workspace_members'].delete_many({})
    db['workspace_invites'].delete_many({})
    db['project_members'].delete_many({})
    db['users'].delete_many({})

    ws_id = ObjectId()
    uid1 = ObjectId()
    uid2 = ObjectId()
    uid3 = ObjectId()

    db['workspace_members'].insert_many([
        {'workspace_id': ws_id, 'user_id': uid1, 'role': 'guest', 'status': 'active'},
        {'workspace_id': ws_id, 'user_id': uid2, 'role': 'billing-admin', 'status': 'active'},
        {'workspace_id': ws_id, 'user_id': uid3, 'role': 'admin', 'status': 'active'},
        # already-valid roles — should not be touched
        {'workspace_id': ws_id, 'user_id': ObjectId(), 'role': 'viewer', 'status': 'active'},
        {'workspace_id': ws_id, 'user_id': ObjectId(), 'role': 'editor', 'status': 'active'},
        {'workspace_id': ws_id, 'user_id': ObjectId(), 'role': 'owner', 'status': 'active'},
    ])

    db['workspace_invites'].insert_many([
        {'workspace_id': ws_id, 'email': 'a@x.com', 'role': 'guest'},
        {'workspace_id': ws_id, 'email': 'b@x.com', 'role': 'billing-admin'},
        {'workspace_id': ws_id, 'email': 'c@x.com', 'role': 'admin'},
    ])

    pid = ObjectId()
    db['project_members'].insert_many([
        {'project_id': pid, 'user_id': uid1, 'role': 'guest'},
        {'project_id': pid, 'user_id': uid2, 'role': 'billing-admin'},
        {'project_id': pid, 'user_id': uid3, 'role': 'admin'},
    ])

    db['users'].insert_many([
        {'email': 'manager@test.com', 'role': 'user'},
        {'email': 'regular@test.com', 'role': 'user'},
    ])


def _run_migration(dry_run: bool, promote_managers: str = ''):
    """Import and invoke migrate_collapse_roles.main() against the test DB."""
    import sys
    import os

    argv = ['migrate_collapse_roles.py']
    if dry_run:
        argv.append('--dry-run')
    else:
        argv.append('--apply')
    if promote_managers:
        argv += ['--promote-managers', promote_managers]

    old_argv = sys.argv
    old_uri = os.environ.get('MONGO_URI')
    os.environ['MONGO_URI'] = TEST_URI
    sys.argv = argv
    try:
        import importlib, importlib.util, pathlib
        spec = importlib.util.spec_from_file_location(
            'migrate_collapse_roles',
            str(pathlib.Path(__file__).parent.parent / 'scripts' / 'migrate_collapse_roles.py'),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.main()
    finally:
        sys.argv = old_argv
        if old_uri is None:
            os.environ.pop('MONGO_URI', None)
        else:
            os.environ['MONGO_URI'] = old_uri


class TestDryRun:
    def test_dry_run_does_not_modify(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=True)

        # Legacy roles must still be present after dry-run.
        assert mig_db['workspace_members'].count_documents({'role': 'guest'}) == 1
        assert mig_db['workspace_members'].count_documents({'role': 'billing-admin'}) == 1
        assert mig_db['workspace_members'].count_documents({'role': 'admin'}) == 1


class TestApply:
    def test_workspace_members_mapped(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=False)

        assert mig_db['workspace_members'].count_documents({'role': 'guest'}) == 0
        assert mig_db['workspace_members'].count_documents({'role': 'billing-admin'}) == 0
        assert mig_db['workspace_members'].count_documents({'role': 'admin'}) == 0

        assert mig_db['workspace_members'].count_documents({'role': 'viewer'}) >= 2  # guest + existing viewer
        assert mig_db['workspace_members'].count_documents({'role': 'editor'}) >= 2  # billing-admin + existing editor
        assert mig_db['workspace_members'].count_documents({'role': 'owner'}) >= 2   # admin + existing owner

    def test_workspace_invites_mapped(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=False)

        assert mig_db['workspace_invites'].count_documents({'role': 'guest'}) == 0
        assert mig_db['workspace_invites'].count_documents({'role': 'billing-admin'}) == 0
        assert mig_db['workspace_invites'].count_documents({'role': 'admin'}) == 0

        assert mig_db['workspace_invites'].count_documents({'role': 'viewer'}) == 1
        assert mig_db['workspace_invites'].count_documents({'role': 'editor'}) == 1
        assert mig_db['workspace_invites'].count_documents({'role': 'owner'}) == 1

    def test_project_members_admin_downgraded_to_editor(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=False)

        assert mig_db['project_members'].count_documents({'role': 'admin'}) == 0
        assert mig_db['project_members'].count_documents({'role': 'billing-admin'}) == 0
        # admin→editor and billing-admin→editor: expect 2 editors
        assert mig_db['project_members'].count_documents({'role': 'editor'}) == 2
        assert mig_db['project_members'].count_documents({'role': 'viewer'}) == 1

    def test_idempotent_on_second_run(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=False)
        # Second run should change nothing further.
        _run_migration(dry_run=False)

        assert mig_db['workspace_members'].count_documents({'role': 'guest'}) == 0
        assert mig_db['workspace_invites'].count_documents({'role': 'billing-admin'}) == 0

    def test_promote_managers(self, mig_db):
        _seed(mig_db)
        _run_migration(dry_run=False, promote_managers='manager@test.com')

        user = mig_db['users'].find_one({'email': 'manager@test.com'})
        assert user['role'] == 'manager'

        untouched = mig_db['users'].find_one({'email': 'regular@test.com'})
        assert untouched['role'] == 'user'
