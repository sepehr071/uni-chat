"""Tests for `/api/users/ai-preferences` GET + PUT (app/routes/ai_preferences.py).

Covers default-on-GET, full-payload PUT, per-field validation, timezone roundtrip
(needs `tzdata` on Windows), and banned-user 403.
"""

from app.extensions import mongo


class TestGetAIPreferences:
    def test_returns_defaults_for_new_user(self, client, test_user, auth_headers):
        r = client.get('/api/users/ai-preferences', headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        prefs = data['preferences']
        assert prefs['enabled'] is True
        assert prefs['user_info']['expertise_level'] == 'intermediate'
        assert prefs['behavior']['tone'] == 'professional'
        assert prefs['behavior']['response_style'] == 'balanced'
        assert prefs['custom_instructions'] == ''
        assert data['timezone'] == 'UTC'

    def test_requires_auth(self, client):
        r = client.get('/api/users/ai-preferences')
        assert r.status_code == 401

    def test_banned_user_rejected(self, app, db, test_user, auth_headers, client):
        with app.app_context():
            mongo.db.users.update_one(
                {'_id': test_user['_id']},
                {'$set': {'status.is_banned': True, 'status.ban_reason': 'spam'}},
            )
        r = client.get('/api/users/ai-preferences', headers=auth_headers)
        assert r.status_code == 403


class TestUpdateAIPreferences:
    def test_empty_body_rejected(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_full_payload_round_trip(self, client, test_user, auth_headers):
        payload = {
            'enabled': False,
            'user_info': {
                'name': 'Sepehr',
                'language': 'Persian',
                'expertise_level': 'expert',
            },
            'behavior': {'tone': 'friendly', 'response_style': 'concise'},
            'custom_instructions': 'Be terse.',
        }
        r = client.put('/api/users/ai-preferences', json=payload, headers=auth_headers)
        assert r.status_code == 200
        prefs = r.get_json()['preferences']
        assert prefs['enabled'] is False
        assert prefs['user_info']['name'] == 'Sepehr'
        assert prefs['user_info']['expertise_level'] == 'expert'
        assert prefs['behavior']['tone'] == 'friendly'
        assert prefs['behavior']['response_style'] == 'concise'
        assert prefs['custom_instructions'] == 'Be terse.'

    def test_partial_merge_keeps_existing(self, client, test_user, auth_headers):
        # First set tone=friendly.
        r = client.put('/api/users/ai-preferences',
                       json={'behavior': {'tone': 'friendly'}}, headers=auth_headers)
        assert r.status_code == 200
        # Now PUT a different field — tone should survive.
        r2 = client.put('/api/users/ai-preferences',
                        json={'user_info': {'name': 'X'}}, headers=auth_headers)
        assert r2.status_code == 200
        prefs = r2.get_json()['preferences']
        assert prefs['behavior']['tone'] == 'friendly'
        assert prefs['user_info']['name'] == 'X'

    def test_enabled_must_be_bool(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences', json={'enabled': 'yes'}, headers=auth_headers)
        assert r.status_code == 400

    def test_user_info_must_be_dict(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences', json={'user_info': 'bad'}, headers=auth_headers)
        assert r.status_code == 400

    def test_user_info_name_must_be_str(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'user_info': {'name': 5}}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_expertise_level(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'user_info': {'expertise_level': 'guru'}}, headers=auth_headers)
        assert r.status_code == 400
        assert 'expertise_level' in r.get_json()['details'][0]

    def test_invalid_tone(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'behavior': {'tone': 'snarky'}}, headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_response_style(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'behavior': {'response_style': 'verbose'}}, headers=auth_headers)
        assert r.status_code == 400

    def test_behavior_must_be_dict(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'behavior': []}, headers=auth_headers)
        assert r.status_code == 400

    def test_custom_instructions_must_be_str(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'custom_instructions': 123}, headers=auth_headers)
        assert r.status_code == 400

    def test_custom_instructions_2000_char_cap_rejected(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'custom_instructions': 'x' * 2001}, headers=auth_headers)
        assert r.status_code == 400

    def test_custom_instructions_at_cap_accepted(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'custom_instructions': 'x' * 2000}, headers=auth_headers)
        assert r.status_code == 200

    def test_timezone_round_trip(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'timezone': 'America/New_York'}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['timezone'] == 'America/New_York'

    def test_invalid_timezone(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'timezone': 'Mars/Olympus'}, headers=auth_headers)
        assert r.status_code == 400

    def test_blank_timezone(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'timezone': '   '}, headers=auth_headers)
        assert r.status_code == 400

    def test_multiple_errors_reported(self, client, test_user, auth_headers):
        r = client.put('/api/users/ai-preferences',
                       json={'enabled': 'bad', 'behavior': {'tone': 'bad'}},
                       headers=auth_headers)
        assert r.status_code == 400
        assert len(r.get_json()['details']) >= 2

    def test_banned_user_blocked(self, app, db, client, test_user, auth_headers):
        with app.app_context():
            mongo.db.users.update_one(
                {'_id': test_user['_id']},
                {'$set': {'status.is_banned': True}},
            )
        r = client.put('/api/users/ai-preferences',
                       json={'enabled': True}, headers=auth_headers)
        assert r.status_code == 403
