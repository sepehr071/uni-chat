"""Tests for groups routes — CRUD + membership + cascade-on-delete."""

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


def _create_team_ws(client, headers, name='Group Test WS'):
    r = client.post('/api/workspaces/create', json={'name': name}, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _promote_to_admin(app, wid, user_id):
    """Workspace owners get admin-tier semantics already; helper keeps tests consistent."""
    from app.models.workspace_member import WorkspaceMemberModel
    with app.app_context():
        WorkspaceMemberModel.add(wid, str(user_id), 'admin', status='active')


# ---------------------------------------------------------------------------
# TestGroupCRUD
# ---------------------------------------------------------------------------

class TestGroupCRUD:
    def test_owner_can_create_group(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='WS Create Group')
        r = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Engineering', 'color': '#a387f6', 'description': 'Eng team'},
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        body = r.get_json()
        assert body['name'] == 'Engineering'
        assert body['workspace_id'] == ws['_id']
        assert body['member_count'] == 0

    def test_create_rejects_duplicate_name(self, app, db, client, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='WS Dup Group')
        r1 = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Marketing'},
            headers=auth_headers,
        )
        assert r1.status_code == 201

        r2 = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Marketing'},
            headers=auth_headers,
        )
        assert r2.status_code == 409
        assert r2.get_json().get('code') == 'group_name_exists'

    def test_viewer_cannot_create(self, app, db, client, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel

        ws = _create_team_ws(client, auth_headers, name='WS Viewer Block')
        u2 = _make_user(app, 'group_viewer@example.com')
        with app.app_context():
            WorkspaceMemberModel.add(ws['_id'], str(u2['_id']), 'viewer', status='active')

        h2 = _headers(app, u2)
        r = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Sales'},
            headers=h2,
        )
        assert r.status_code == 403

    def test_list_returns_groups(self, app, db, client, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='WS List Groups')
        for nm in ('Alpha', 'Beta', 'Gamma'):
            client.post(
                f"/api/workspaces/{ws['_id']}/groups",
                json={'name': nm},
                headers=auth_headers,
            )
        r = client.get(f"/api/workspaces/{ws['_id']}/groups/list", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert 'groups' in body
        names = sorted(g['name'] for g in body['groups'])
        assert names == ['Alpha', 'Beta', 'Gamma']

    def test_get_with_members(self, app, db, client, test_user, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='WS Get Group')
        r1 = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Detail Group'},
            headers=auth_headers,
        )
        gid = r1.get_json()['_id']

        r = client.get(f"/api/workspaces/{ws['_id']}/groups/{gid}", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body['name'] == 'Detail Group'
        assert body.get('members') == []

    def test_update_name(self, app, db, client, auth_headers):
        ws = _create_team_ws(client, auth_headers, name='WS Update Group')
        r1 = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'OldName'},
            headers=auth_headers,
        )
        gid = r1.get_json()['_id']
        r = client.put(
            f"/api/workspaces/{ws['_id']}/groups/{gid}",
            json={'name': 'NewName'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['name'] == 'NewName'

    def test_delete_cascades(self, app, db, client, test_user, auth_headers):
        from app.models.group_member import GroupMemberModel
        from app.models.project_group_access import ProjectGroupAccessModel

        ws = _create_team_ws(client, auth_headers, name='WS Cascade Group')
        r1 = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': 'Cascade'},
            headers=auth_headers,
        )
        gid = r1.get_json()['_id']

        # Add a member.
        u2 = _make_user(app, 'cascade_member@example.com')
        from app.models.workspace_member import WorkspaceMemberModel
        with app.app_context():
            WorkspaceMemberModel.add(ws['_id'], str(u2['_id']), 'editor', status='active')

        client.post(
            f"/api/workspaces/{ws['_id']}/groups/{gid}/members",
            json={'user_id': str(u2['_id'])},
            headers=auth_headers,
        )

        # Add an access grant on a project.
        from app.models.project_group_access import ProjectGroupAccessModel
        proj_r = client.post(
            '/api/projects/create',
            json={'workspace_id': ws['_id'], 'name': 'Cascade Proj'},
            headers=auth_headers,
        )
        pid = proj_r.get_json()['_id']
        with app.app_context():
            ProjectGroupAccessModel.set(pid, gid, 'viewer')

        # Delete group.
        r = client.delete(
            f"/api/workspaces/{ws['_id']}/groups/{gid}",
            headers=auth_headers,
        )
        assert r.status_code == 200

        with app.app_context():
            assert list(GroupMemberModel.get_collection().find({'group_id': ObjectId(gid)})) == []
            assert list(ProjectGroupAccessModel.get_collection().find({'group_id': ObjectId(gid)})) == []


# ---------------------------------------------------------------------------
# TestGroupMembership
# ---------------------------------------------------------------------------

class TestGroupMembership:
    def _setup(self, app, client, auth_headers, ws_name='WS Members', group_name='G1'):
        ws = _create_team_ws(client, auth_headers, name=ws_name)
        r = client.post(
            f"/api/workspaces/{ws['_id']}/groups",
            json={'name': group_name},
            headers=auth_headers,
        )
        gid = r.get_json()['_id']
        return ws, gid

    def test_add_member_recomputes_count(self, app, db, client, test_user, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel
        from app.models.group import GroupModel

        ws, gid = self._setup(app, client, auth_headers, 'WS GMRC', 'GMRC')

        u2 = _make_user(app, 'group_member@example.com')
        with app.app_context():
            WorkspaceMemberModel.add(ws['_id'], str(u2['_id']), 'editor', status='active')

        r = client.post(
            f"/api/workspaces/{ws['_id']}/groups/{gid}/members",
            json={'user_id': str(u2['_id'])},
            headers=auth_headers,
        )
        assert r.status_code == 201

        with app.app_context():
            doc = GroupModel.find_by_id(gid)
        assert doc['member_count'] == 1

    def test_add_rejects_non_workspace_member(self, app, db, client, test_user, auth_headers):
        ws, gid = self._setup(app, client, auth_headers, 'WS GMNW', 'GMNW')

        # u2 is not a member of the workspace.
        u2 = _make_user(app, 'no_ws@example.com')

        r = client.post(
            f"/api/workspaces/{ws['_id']}/groups/{gid}/members",
            json={'user_id': str(u2['_id'])},
            headers=auth_headers,
        )
        assert r.status_code == 400
        assert r.get_json().get('code') == 'not_in_workspace'

    def test_remove_member_recomputes(self, app, db, client, test_user, auth_headers):
        from app.models.workspace_member import WorkspaceMemberModel
        from app.models.group import GroupModel

        ws, gid = self._setup(app, client, auth_headers, 'WS GMR', 'GMR')

        u2 = _make_user(app, 'rm_member@example.com')
        with app.app_context():
            WorkspaceMemberModel.add(ws['_id'], str(u2['_id']), 'editor', status='active')

        # add then remove
        client.post(
            f"/api/workspaces/{ws['_id']}/groups/{gid}/members",
            json={'user_id': str(u2['_id'])},
            headers=auth_headers,
        )
        r = client.delete(
            f"/api/workspaces/{ws['_id']}/groups/{gid}/members/{str(u2['_id'])}",
            headers=auth_headers,
        )
        assert r.status_code == 200

        with app.app_context():
            doc = GroupModel.find_by_id(gid)
        assert doc['member_count'] == 0
