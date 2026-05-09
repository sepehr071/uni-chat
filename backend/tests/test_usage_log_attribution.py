"""Integration test: one usage_logs row per chat send, with workspace/project/origin attribution."""

import json
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId


def _make_stream_response(prompt_tokens=100, completion_tokens=200, cost=0.005, model='openai/gpt-test'):
    chunk_content = json.dumps({
        'model': model,
        'choices': [{'delta': {'role': 'assistant', 'content': 'Hello'}, 'finish_reason': None}],
    })
    chunk_usage = json.dumps({
        'model': model,
        'choices': [],
        'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'cost': cost},
    })
    lines = [
        f'data: {chunk_content}'.encode(),
        b'',
        f'data: {chunk_usage}'.encode(),
        b'',
        b'data: [DONE]',
    ]
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.iter_lines.return_value = iter(lines)
    return mock_resp


@pytest.fixture()
def workspace_project_conversation(app, client, db, test_user, auth_headers):
    """Create workspace W, project P via API, then insert conversation C linked to P."""
    with app.app_context():
        ws_r = client.post('/api/workspaces/create', json={'name': 'AttribCo'}, headers=auth_headers)
        assert ws_r.status_code == 201, ws_r.get_json()
        ws = ws_r.get_json()
        ws_id = ObjectId(ws['_id'])

        proj_r = client.post('/api/projects/create', json={
            'workspace_id': ws['_id'],
            'name': 'AttribProject',
        }, headers=auth_headers)
        assert proj_r.status_code == 201, proj_r.get_json()
        proj = proj_r.get_json()
        proj_id = ObjectId(proj['_id'])

        user_id = test_user['_id']
        from app.extensions import mongo
        conv_id = mongo.db.conversations.insert_one({
            'user_id': user_id,
            'project_id': proj_id,
            'workspace_id': ws_id,
            'title': 'AttribConv',
            'config_id': 'quick:openai/gpt-test',
            'active_branch': 'main',
            'message_count': 0,
            'input_tokens': 0,
            'output_tokens': 0,
        }).inserted_id

        mongo.db.users.update_one(
            {'_id': user_id},
            {'$set': {'active_workspace_id': ws_id}},
        )

    return {'ws_id': ws_id, 'proj_id': proj_id, 'conv_id': conv_id}


def test_single_usage_log_with_attribution(app, client, db, test_user, auth_headers, workspace_project_conversation):
    """POST /api/chat/stream writes exactly one usage_logs row with workspace_id, project_id, origin='web'."""
    try:
        from app.extensions import mongo
        with app.app_context():
            mongo.db.command('ping')
    except Exception:
        pytest.skip('MongoDB not reachable')

    ids = workspace_project_conversation
    conv_id = ids['conv_id']
    ws_id = ids['ws_id']
    proj_id = ids['proj_id']

    mock_resp = _make_stream_response(prompt_tokens=100, completion_tokens=200, cost=0.005)

    with patch('requests.post', return_value=mock_resp):
        resp = client.post(
            '/api/chat/stream',
            json={
                'conversation_id': str(conv_id),
                'config_id': 'quick:openai/gpt-test',
                'message': 'Hello world',
            },
            headers=auth_headers,
        )
        _ = resp.get_data(as_text=True)

    with app.app_context():
        from app.extensions import mongo as mdb

        count = mdb.db.usage_logs.count_documents({'conversation_id': conv_id})
        assert count == 1, f'Expected 1 usage_logs doc, got {count}'

        doc = mdb.db.usage_logs.find_one({'conversation_id': conv_id})
        assert doc is not None

        assert doc.get('workspace_id') == ws_id, f"workspace_id mismatch: {doc.get('workspace_id')}"
        assert doc.get('project_id') == proj_id, f"project_id mismatch: {doc.get('project_id')}"
        assert doc.get('origin') == 'web', f"origin mismatch: {doc.get('origin')}"
        assert abs(doc.get('cost_usd', 0) - 0.005) < 1e-9, f"cost_usd mismatch: {doc.get('cost_usd')}"
        assert doc.get('prompt_tokens') == 100, f"prompt_tokens mismatch: {doc.get('prompt_tokens')}"
        assert doc.get('completion_tokens') == 200, f"completion_tokens mismatch: {doc.get('completion_tokens')}"
