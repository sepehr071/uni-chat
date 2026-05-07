"""
Tests for POST /api/conversations/<id>/move and PUT project_id rejection.
"""

import pytest
from bson import ObjectId
from flask_jwt_extended import create_access_token


# ---------------------------------------------------------------------------
# Inline helpers
# ---------------------------------------------------------------------------

def _make_user(app, email, display_name='User', role='manager'):
    from app.models.user import UserModel
    with app.app_context():
        return UserModel.create(email=email, password='Pw123!@#', display_name=display_name,
                                role=role)


def _headers(app, user):
    with app.app_context():
        tok = create_access_token(identity=str(user['_id']))
    return {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}


def _create_conversation(app, client, headers):
    """Create a minimal conversation via direct model call, return conv dict."""
    from app.models.conversation import ConversationModel
    from app.models.user import UserModel
    # Parse user_id from JWT is complex; use POST route with a quick-prefix config
    r = client.post(
        '/api/conversations',
        json={
            'config_id': 'quick:google/gemini-3-flash-preview',
            'title': 'Test Conv',
        },
        headers=headers,
    )
    assert r.status_code == 201, r.get_json()
    return r.get_json()['conversation']


def _setup_project(app, client, headers, ws_name='WS Conv', proj_name='Proj Conv'):
    """Create team workspace + project. Returns (ws, proj)."""
    r_ws = client.post('/api/workspaces/create', json={'name': ws_name}, headers=headers)
    assert r_ws.status_code == 201
    ws = r_ws.get_json()
    r_proj = client.post(
        '/api/projects/create',
        json={'workspace_id': ws['_id'], 'name': proj_name},
        headers=headers,
    )
    assert r_proj.status_code == 201
    return ws, r_proj.get_json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestConversationsMove:
    def test_put_rejects_project_id(self, app, db, client, test_user, auth_headers):
        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']
        r = client.put(
            f'/api/conversations/{cid}',
            json={'project_id': 'foo'},
            headers=auth_headers,
        )
        assert r.status_code == 400
        body = r.get_json()
        assert body.get('code') == 'cannot_reassign_project'

    def test_move_to_project_requires_editor_access(self, app, db, client, test_user, auth_headers):
        # Create a project owned by a second user -- test_user has no access
        u2 = _make_user(app, 'move_owner@example.com', 'Move Owner')
        h2 = _headers(app, u2)
        _, proj = _setup_project(app, client, h2, 'WS Move Access', 'Proj Move Access')
        pid = proj['_id']

        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']

        r = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': pid},
            headers=auth_headers,
        )
        assert r.status_code == 403
        body = r.get_json()
        assert body.get('code') == 'project_access_denied'

    def test_move_to_project_succeeds(self, app, db, client, test_user, auth_headers):
        from app.extensions import mongo

        _, proj = _setup_project(app, client, auth_headers, 'WS Move OK', 'Proj Move OK')
        pid = proj['_id']

        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']

        r = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': pid},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.get_json()
        assert body['conversation']['project_id'] == pid

        with app.app_context():
            doc = mongo.db.conversations.find_one({'_id': ObjectId(cid)})
        assert doc is not None
        assert str(doc['project_id']) == pid

    def test_move_to_unfile(self, app, db, client, test_user, auth_headers):
        from app.extensions import mongo

        _, proj = _setup_project(app, client, auth_headers, 'WS Unfile', 'Proj Unfile')
        pid = proj['_id']

        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']

        # First move into project
        r1 = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': pid},
            headers=auth_headers,
        )
        assert r1.status_code == 200

        # Then unfile (project_id = null)
        r2 = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': None},
            headers=auth_headers,
        )
        assert r2.status_code == 200

        with app.app_context():
            doc = mongo.db.conversations.find_one({'_id': ObjectId(cid)})
        assert doc is not None
        assert doc.get('project_id') is None

    def test_move_invalid_id_400(self, app, db, client, test_user, auth_headers):
        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']

        r = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': 'not-hex'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_move_other_users_conversation_404(self, app, db, client, test_user, auth_headers):
        # Create conversation as test_user
        conv = _create_conversation(app, client, auth_headers)
        cid = conv['_id']

        # Second user tries to move it
        u2 = _make_user(app, 'conv_other@example.com', 'Other')
        h2 = _headers(app, u2)

        r = client.post(
            f'/api/conversations/{cid}/move',
            json={'project_id': None},
            headers=h2,
        )
        assert r.status_code == 404
