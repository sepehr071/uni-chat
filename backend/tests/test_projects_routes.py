"""
Tests for projects routes: CRUD and member management.

All helpers are inlined -- no new conftest fixtures.
"""

import pytest
from bson import ObjectId
from flask_jwt_extended import create_access_token


# ---------------------------------------------------------------------------
# Inline helpers
# ---------------------------------------------------------------------------

def _make_user(app, email, display_name='User'):
    from app.models.user import UserModel
    with app.app_context():
        return UserModel.create(email=email, password='Pw123!@#', display_name=display_name)


def _headers(app, user):
    with app.app_context():
        tok = create_access_token(identity=str(user['_id']))
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


def _create_team_ws(app, client, headers, name='Test Workspace'):
    r = client.post('/api/workspaces/create', json={'name': name}, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _create_project(client, headers, workspace_id, name='Test Project'):
    r = client.post(
        '/api/projects/create',
        json={'workspace_id': workspace_id, 'name': name},
        headers=headers,
    )
    assert r.status_code == 201, r.get_json()
    return r.get_json()


# ---------------------------------------------------------------------------
# TestProjectCRUD
# ---------------------------------------------------------------------------

class TestProjectCRUD:
    def test_create_in_team_workspace(self, app, db, client, test_user, auth_headers):
        from app.models.project_member import ProjectMemberModel

        ws = _create_team_ws(app, client, auth_headers, name='WS for Project')
        proj = _create_project(client, auth_headers, ws['_id'], name='Alpha')

        assert proj['name'] == 'Alpha'
        pid = proj['_id']

        with app.app_context():
            member = ProjectMemberModel.find(pid, str(test_user['_id']))
        assert member is not None
        assert member['role'] == 'owner'

    def test_create_requires_workspace_editor(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Editor Check')
        wid = ws['_id']

        # Create a viewer user, add them to the workspace as viewer
        u2 = _make_user(app, 'viewer_proj@example.com', 'Viewer')
        h2 = _headers(app, u2)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'viewer', status='active')

        r = client.post(
            '/api/projects/create',
            json={'workspace_id': wid, 'name': 'Blocked Project'},
            headers=h2,
        )
        assert r.status_code == 403

    def test_list_filters_by_workspace_id(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS List')
        wid = ws['_id']
        _create_project(client, auth_headers, wid, name='Proj A')
        _create_project(client, auth_headers, wid, name='Proj B')

        r = client.get(f'/api/projects/list?workspace_id={wid}', headers=auth_headers)
        assert r.status_code == 200
        projects = r.get_json()
        assert isinstance(projects, list)
        names = [p['name'] for p in projects]
        assert 'Proj A' in names
        assert 'Proj B' in names
        for p in projects:
            assert 'member_role' in p

    def test_archive_via_patch(self, app, db, client, test_user, auth_headers):
        from app.models.project import ProjectModel

        ws = _create_team_ws(app, client, auth_headers, name='WS Archive')
        proj = _create_project(client, auth_headers, ws['_id'], name='Archivable')
        pid = proj['_id']

        r = client.patch(f'/api/projects/{pid}', json={'archived': True}, headers=auth_headers)
        assert r.status_code == 200

        # Should not appear in non-archived list
        with app.app_context():
            live = ProjectModel.find_by_workspace(ws['_id'], archived=False)
        live_ids = [str(p['_id']) for p in live]
        assert pid not in live_ids

    def test_delete_resets_folders_and_conversations_project_id(
        self, app, db, client, test_user, auth_headers
    ):
        from app.extensions import mongo

        ws = _create_team_ws(app, client, auth_headers, name='WS Delete Cascade')
        proj = _create_project(client, auth_headers, ws['_id'], name='Cascade Project')
        pid = proj['_id']
        pid_obj = ObjectId(pid)

        # Insert a folder and a conversation directly with project_id set
        with app.app_context():
            folder_id = mongo.db.folders.insert_one({
                'user_id': test_user['_id'],
                'project_id': pid_obj,
                'name': 'Proj Folder',
                'parent_id': None,
                'order': 0,
            }).inserted_id

            conv_id = mongo.db.conversations.insert_one({
                'user_id': test_user['_id'],
                'project_id': pid_obj,
                'title': 'Proj Conv',
                'config_id': ObjectId(),
            }).inserted_id

        r = client.delete(f'/api/projects/{pid}', headers=auth_headers)
        assert r.status_code == 200

        with app.app_context():
            folder = mongo.db.folders.find_one({'_id': folder_id})
            conv = mongo.db.conversations.find_one({'_id': conv_id})

        assert folder is not None
        assert folder.get('project_id') is None
        assert conv is not None
        assert conv.get('project_id') is None


# ---------------------------------------------------------------------------
# TestProjectMembers
# ---------------------------------------------------------------------------

class TestProjectMembers:
    def _setup(self, app, client, auth_headers, ws_name='WS Members', proj_name='Proj Members'):
        ws = _create_team_ws(app, client, auth_headers, name=ws_name)
        proj = _create_project(client, auth_headers, ws['_id'], name=proj_name)
        return ws, proj

    def test_list_members_endpoint(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers, 'WS LM', 'Proj LM')
        pid = proj['_id']

        r = client.get(f'/api/projects/{pid}/members', headers=auth_headers)
        assert r.status_code == 200
        members = r.get_json()
        assert isinstance(members, list)
        assert len(members) >= 1
        for m in members:
            assert 'user' in m
            assert 'email' in m['user']

    def test_add_member_must_be_in_workspace(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers, 'WS AMWP', 'Proj AMWP')
        pid = proj['_id']

        # u2 is NOT a workspace member
        u2 = _make_user(app, 'no_ws_member@example.com', 'No WS')

        r = client.post(
            f'/api/projects/{pid}/members',
            json={'user_id': str(u2['_id']), 'role': 'editor'},
            headers=auth_headers,
        )
        assert r.status_code == 400
        body = r.get_json()
        assert body.get('code') == 'not_in_workspace'

    def test_update_role_last_owner_blocked(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers, 'WS URLOB', 'Proj URLOB')
        pid = proj['_id']
        uid = str(test_user['_id'])

        # Only one explicit project owner -- demoting should fail
        r = client.patch(
            f'/api/projects/{pid}/members/{uid}',
            json={'role': 'editor'},
            headers=auth_headers,
        )
        assert r.status_code == 400
        body = r.get_json()
        assert body.get('code') == 'last_owner_protected'

    def test_remove_member_works(self, app, db, client, test_user, auth_headers):
        from app.models.project_member import ProjectMemberModel

        ws, proj = self._setup(app, client, auth_headers, 'WS RMW', 'Proj RMW')
        pid = proj['_id']
        wid = ws['_id']

        # Add u2 to workspace and then to project as editor
        u2 = _make_user(app, 'proj_removable@example.com', 'Removable')
        uid2 = str(u2['_id'])

        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, uid2, 'editor', status='active')

        r_add = client.post(
            f'/api/projects/{pid}/members',
            json={'user_id': uid2, 'role': 'editor'},
            headers=auth_headers,
        )
        assert r_add.status_code == 201

        with app.app_context():
            before = ProjectMemberModel.find_by_project(pid)
        count_before = len(before)

        r_del = client.delete(f'/api/projects/{pid}/members/{uid2}', headers=auth_headers)
        assert r_del.status_code == 200

        with app.app_context():
            after = ProjectMemberModel.find_by_project(pid)
        assert len(after) == count_before - 1
        uid2_obj = ObjectId(uid2)
        remaining_ids = [m['user_id'] for m in after]
        assert uid2_obj not in remaining_ids


# ---------------------------------------------------------------------------
# TestProjectDecoration  -- pin / tags
# ---------------------------------------------------------------------------

class TestProjectDecoration:
    def test_pin_toggle(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Pin')
        proj = _create_project(client, auth_headers, ws['_id'], name='PinMe')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}/pin',
            json={'pinned': True},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json().get('pinned') is True

        r2 = client.patch(
            f'/api/projects/{pid}/pin',
            json={'pinned': False},
            headers=auth_headers,
        )
        assert r2.status_code == 200
        assert r2.get_json().get('pinned') is False

    def test_pin_validation(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Pin Val')
        proj = _create_project(client, auth_headers, ws['_id'], name='Val')
        pid = proj['_id']

        r = client.patch(f'/api/projects/{pid}/pin', json={}, headers=auth_headers)
        assert r.status_code == 400

        r2 = client.patch(
            f'/api/projects/{pid}/pin',
            json={'pinned': 'yes'},
            headers=auth_headers,
        )
        assert r2.status_code == 400

    def test_tags_replace(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Tags')
        proj = _create_project(client, auth_headers, ws['_id'], name='Tagged')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}/tags',
            json={'tags': ['ai', 'priority', 'q1']},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.get_json()
        assert sorted(body['tags']) == ['ai', 'priority', 'q1']

        r2 = client.patch(
            f'/api/projects/{pid}/tags',
            json={'tags': []},
            headers=auth_headers,
        )
        assert r2.status_code == 200
        assert r2.get_json()['tags'] == []

    def test_tags_validation(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Tags Val')
        proj = _create_project(client, auth_headers, ws['_id'], name='ValT')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}/tags',
            json={'tags': 'not-a-list'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_default_model_patch(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Default Model')
        proj = _create_project(client, auth_headers, ws['_id'], name='DefMod')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}',
            json={'default_model': 'openai/gpt-5.2'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json().get('default_model') == 'openai/gpt-5.2'

    def test_default_temperature_in_range(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Temp Range')
        proj = _create_project(client, auth_headers, ws['_id'], name='Temp')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}',
            json={'default_temperature': 0.7},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert abs(r.get_json().get('default_temperature') - 0.7) < 1e-9

    def test_default_temperature_out_of_range(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Temp Bad')
        proj = _create_project(client, auth_headers, ws['_id'], name='TempBad')
        pid = proj['_id']

        r = client.patch(
            f'/api/projects/{pid}',
            json={'default_temperature': 2.5},
            headers=auth_headers,
        )
        assert r.status_code == 400

        r2 = client.patch(
            f'/api/projects/{pid}',
            json={'default_temperature': -0.1},
            headers=auth_headers,
        )
        assert r2.status_code == 400


# ---------------------------------------------------------------------------
# TestProjectWebhooks
# ---------------------------------------------------------------------------

class TestProjectWebhooks:
    def _setup(self, app, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='Webhook WS')
        proj = _create_project(client, auth_headers, ws['_id'], name='HookProj')
        return ws, proj

    def test_create_returns_secret(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        pid = proj['_id']

        r = client.post(
            f'/api/projects/{pid}/webhooks',
            json={
                'name': 'New chat hook',
                'url': 'https://hooks.example.com/abc',
                'events': ['chat.message.created'],
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        body = r.get_json()
        assert body.get('secret')
        assert body.get('name') == 'New chat hook'
        assert body.get('url') == 'https://hooks.example.com/abc'
        assert body.get('events') == ['chat.message.created']

    def test_list_omits_secret(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        pid = proj['_id']

        r_create = client.post(
            f'/api/projects/{pid}/webhooks',
            json={'name': 'List Hook', 'url': 'https://hooks.example.com/list'},
            headers=auth_headers,
        )
        assert r_create.status_code == 201

        r = client.get(f'/api/projects/{pid}/webhooks', headers=auth_headers)
        assert r.status_code == 200
        rows = r.get_json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        for row in rows:
            assert 'secret' not in row

    def test_put_updates(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        pid = proj['_id']

        r_create = client.post(
            f'/api/projects/{pid}/webhooks',
            json={'name': 'Old', 'url': 'https://hooks.example.com/old'},
            headers=auth_headers,
        )
        whid = r_create.get_json()['_id']

        r = client.put(
            f'/api/projects/{pid}/webhooks/{whid}',
            json={'name': 'New Name', 'enabled': False},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.get_json()
        body = r.get_json()
        assert body.get('name') == 'New Name'
        assert body.get('enabled') is False
        assert 'secret' not in body

    def test_delete_removes(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        pid = proj['_id']

        r_create = client.post(
            f'/api/projects/{pid}/webhooks',
            json={'name': 'Del', 'url': 'https://hooks.example.com/del'},
            headers=auth_headers,
        )
        whid = r_create.get_json()['_id']

        r = client.delete(f'/api/projects/{pid}/webhooks/{whid}', headers=auth_headers)
        assert r.status_code == 200

        r2 = client.get(f'/api/projects/{pid}/webhooks', headers=auth_headers)
        ids = [w['_id'] for w in r2.get_json()]
        assert whid not in ids

    def test_rotate_secret_returns_new(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        pid = proj['_id']

        r_create = client.post(
            f'/api/projects/{pid}/webhooks',
            json={'name': 'Rot', 'url': 'https://hooks.example.com/rot'},
            headers=auth_headers,
        )
        whid = r_create.get_json()['_id']
        original_secret = r_create.get_json()['secret']

        r = client.post(
            f'/api/projects/{pid}/webhooks/{whid}/rotate-secret',
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.get_json()
        assert body.get('secret')
        assert body['secret'] != original_secret

    def test_non_owner_forbidden(self, app, db, client, test_user, auth_headers):
        ws, proj = self._setup(app, client, auth_headers)
        wid = ws['_id']
        pid = proj['_id']

        # u2 is workspace editor -- not project owner.
        u2 = _make_user(app, 'hook_editor@example.com', 'HookEditor')
        h2 = _headers(app, u2)
        with app.app_context():
            from app.models.workspace_member import WorkspaceMemberModel
            WorkspaceMemberModel.add(wid, str(u2['_id']), 'editor', status='active')

        r = client.post(
            f'/api/projects/{pid}/webhooks',
            json={'name': 'NoPerm', 'url': 'https://hooks.example.com/np'},
            headers=h2,
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# TestProjectAccess  -- groups + direct members
# ---------------------------------------------------------------------------

class TestProjectAccess:
    def _make_group(self, client, auth_headers, wid, name='Engineering'):
        r = client.post(
            f'/api/workspaces/{wid}/groups',
            json={'name': name},
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        return r.get_json()['_id']

    def test_add_group_access(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Access')
        proj = _create_project(client, auth_headers, ws['_id'], name='AccessProj')
        pid = proj['_id']

        gid = self._make_group(client, auth_headers, ws['_id'], 'AccessGroup')

        r = client.post(
            f'/api/projects/{pid}/access/groups',
            json={'group_id': gid, 'role': 'editor'},
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()

    def test_get_access_lists_groups(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Access GA')
        proj = _create_project(client, auth_headers, ws['_id'], name='AccessProj GA')
        pid = proj['_id']
        gid = self._make_group(client, auth_headers, ws['_id'], 'AccessGroup GA')

        client.post(
            f'/api/projects/{pid}/access/groups',
            json={'group_id': gid, 'role': 'viewer'},
            headers=auth_headers,
        )

        r = client.get(f'/api/projects/{pid}/access', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'groups' in body
        assert 'direct_members' in body
        assert len(body['groups']) == 1
        assert body['groups'][0]['group_id'] == gid
        assert body['groups'][0]['role'] == 'viewer'

    def test_remove_group_access(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Access Rm')
        proj = _create_project(client, auth_headers, ws['_id'], name='RmProj')
        pid = proj['_id']
        gid = self._make_group(client, auth_headers, ws['_id'], 'RmGroup')

        client.post(
            f'/api/projects/{pid}/access/groups',
            json={'group_id': gid, 'role': 'editor'},
            headers=auth_headers,
        )
        r = client.delete(
            f'/api/projects/{pid}/access/groups/{gid}',
            headers=auth_headers,
        )
        assert r.status_code == 200

        r2 = client.get(f'/api/projects/{pid}/access', headers=auth_headers)
        assert r2.status_code == 200
        assert r2.get_json()['groups'] == []

    def test_invalid_role_rejected(self, app, db, client, auth_headers):
        ws = _create_team_ws(app, client, auth_headers, name='WS Role Reject')
        proj = _create_project(client, auth_headers, ws['_id'], name='RoleReject')
        pid = proj['_id']
        gid = self._make_group(client, auth_headers, ws['_id'], 'RoleRejectGroup')

        r = client.post(
            f'/api/projects/{pid}/access/groups',
            json={'group_id': gid, 'role': 'owner'},
            headers=auth_headers,
        )
        assert r.status_code == 400
        assert r.get_json().get('code') == 'invalid_role'
