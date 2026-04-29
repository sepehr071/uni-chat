"""
Tests for the NL schedule parser — POST /api/routines/parse-schedule.
OpenRouterService.chat_completion is mocked to avoid real API calls.
"""

import pytest
from unittest.mock import patch


# Minimal mock response that mimics OpenRouter non-streaming shape
def _llm_response(cron_expr: str) -> dict:
    return {
        'choices': [
            {'message': {'content': cron_expr, 'role': 'assistant'}}
        ]
    }


class TestParseSchedule:
    def test_requires_jwt(self, client):
        r = client.post('/api/routines/parse-schedule', json={'text': 'every day', 'timezone': 'UTC'})
        assert r.status_code == 401

    def test_missing_text_returns_400(self, client, auth_headers):
        r = client.post('/api/routines/parse-schedule', json={'timezone': 'UTC'}, headers=auth_headers)
        assert r.status_code == 400
        assert 'text' in r.get_json().get('error', '').lower()

    def test_invalid_timezone_returns_400(self, client, auth_headers):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('0 9 * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'daily 9am', 'timezone': 'Not/A/Zone'},
                headers=auth_headers,
            )
        assert r.status_code == 400
        body = r.get_json()
        assert 'timezone' in body.get('error', '').lower() or 'timezone' in str(body).lower()

    def test_valid_request_returns_cron_and_preview(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('0 9 * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'every day at 9am', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        assert r.status_code == 200
        body = r.get_json()
        assert body['cron_expr'] == '0 9 * * *'
        assert isinstance(body['preview'], list)
        assert len(body['preview']) == 5
        # Each entry is an ISO-8601 string
        for entry in body['preview']:
            assert isinstance(entry, str)
            assert 'T' in entry  # ISO datetime marker

    def test_preview_list_is_in_utc(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('0 9 * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'every day at 9am', 'timezone': 'America/New_York'},
                headers=auth_headers,
            )

        assert r.status_code == 200
        body = r.get_json()
        # 9 AM New York → UTC 13:00 (EDT) or 14:00 (EST)
        for iso in body['preview']:
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
            assert dt.hour in (13, 14)

    def test_label_returned_for_preset(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('0 9 * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'daily 9am', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        body = r.get_json()
        assert body['label'] == 'Daily 9 AM'

    def test_label_null_for_non_preset(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('*/7 * * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'every 7 minutes', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        body = r.get_json()
        assert body['label'] is None

    def test_invalid_cron_from_llm_returns_400(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('not a cron expression')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'blah blah', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        assert r.status_code == 400
        body = r.get_json()
        assert 'raw_output' in body

    def test_llm_error_returns_502(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value={'error': {'message': 'Model unavailable', 'code': 503}}):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'every day', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        assert r.status_code == 502

    def test_llm_exception_returns_502(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   side_effect=Exception('Network error')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'every day', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        assert r.status_code == 502

    def test_five_preview_times_are_ordered(self, client, auth_headers, db):
        with patch('app.services.openrouter_service.OpenRouterService.chat_completion',
                   return_value=_llm_response('0 9 * * *')):
            r = client.post(
                '/api/routines/parse-schedule',
                json={'text': 'daily at 9', 'timezone': 'UTC'},
                headers=auth_headers,
            )

        from datetime import datetime, timezone
        preview = r.get_json()['preview']
        dts = [datetime.fromisoformat(s.replace('Z', '+00:00')) for s in preview]
        assert dts == sorted(dts), 'preview times should be in ascending order'
