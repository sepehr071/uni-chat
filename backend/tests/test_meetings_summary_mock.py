"""
Assert the summary_service payload sent to OpenRouter is shaped exactly as the
plan requires: strict JSON schema, formal/casual tone fragments,
``temperature=0.2``, ``reasoning={effort:'minimal',exclude:true}``,
``stream=False``, ``origin='meeting'``, ``feature='meeting'``.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest


@pytest.fixture
def fake_openrouter_response():
    """A minimal valid JSON-schema-compatible response payload."""
    return {
        'choices': [
            {
                'message': {
                    'content': json.dumps({
                        'exec_summary': 'ok',
                        'action_items': [],
                        'decisions': [],
                        'qa': [],
                        'open_questions': [],
                        'email_draft': {'subject': '', 'body': ''},
                        'speaker_names': [],
                    })
                }
            }
        ]
    }


class TestSummaryServicePayload:
    def test_payload_shape_formal(self, app, db, fake_openrouter_response):
        from app.services import summary_service
        captured = {}

        def fake_completion(payload, **kwargs):
            captured['payload'] = payload
            captured['kwargs'] = kwargs
            return fake_openrouter_response

        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       side_effect=fake_completion):
                summary_service.summarize(
                    diarized_prompt='[speaker_0 0.00-1.00] سلام',
                    user_id='507f1f77bcf86cd799439011',
                    context=None,
                    email_tone='formal',
                )

        payload = captured['payload']
        assert payload['model'] == summary_service.MEETING_SUMMARY_MODEL
        assert payload['stream'] is False
        assert payload['temperature'] == 0.2
        assert payload['reasoning'] == {'effort': 'minimal', 'exclude': True}

        rf = payload['response_format']
        assert rf['type'] == 'json_schema'
        assert rf['json_schema']['strict'] is True
        assert rf['json_schema']['name'] == 'meeting_brief'
        assert rf['json_schema']['schema'] == summary_service.JSON_SCHEMA

        # Verify FORMAL tone fragment was included.
        system_msgs = [m for m in payload['messages'] if m['role'] == 'system']
        assert any('FORMAL' in m['content'] for m in system_msgs)

        # Kwargs include the attribution tags.
        assert captured['kwargs'].get('origin') == 'meeting'
        assert captured['kwargs'].get('feature') == 'meeting'
        assert captured['kwargs'].get('workspace_id') is None
        assert captured['kwargs'].get('project_id') is None

    def test_payload_shape_casual(self, app, db, fake_openrouter_response):
        from app.services import summary_service
        captured = {}

        def fake_completion(payload, **kwargs):
            captured['payload'] = payload
            return fake_openrouter_response

        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       side_effect=fake_completion):
                summary_service.summarize(
                    diarized_prompt='[speaker_0 0.00-1.00] سلام',
                    user_id='507f1f77bcf86cd799439011',
                    context=None,
                    email_tone='casual',
                )

        system_msgs = [m for m in captured['payload']['messages'] if m['role'] == 'system']
        assert any('CASUAL' in m['content'] for m in system_msgs)

    def test_context_block_included_when_provided(self, app, db, fake_openrouter_response):
        from app.services import summary_service
        captured = {}

        def fake_completion(payload, **kwargs):
            captured['payload'] = payload
            return fake_openrouter_response

        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       side_effect=fake_completion):
                summary_service.summarize(
                    diarized_prompt='[speaker_0 0.00-1.00] سلام',
                    user_id='507f1f77bcf86cd799439011',
                    context='Series: Weekly review. Known speakers: Sara, Ali.',
                    email_tone='formal',
                )

        joined_system = '\n'.join(
            m['content'] for m in captured['payload']['messages'] if m['role'] == 'system'
        )
        assert 'Sara' in joined_system or 'Weekly review' in joined_system


class TestSummaryResponseValidation:
    def test_non_json_content_raises_valueerror(self, app, db):
        from app.services import summary_service
        bad_response = {'choices': [{'message': {'content': 'not-json'}}]}
        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       return_value=bad_response):
                with pytest.raises(ValueError):
                    summary_service.summarize(
                        diarized_prompt='x',
                        user_id='507f1f77bcf86cd799439011',
                        email_tone='formal',
                    )

    def test_invalid_schema_raises_valueerror(self, app, db):
        from app.services import summary_service
        # Missing required keys → schema validation fails.
        bad = {'choices': [{'message': {'content': json.dumps({'exec_summary': 'x'})}}]}
        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       return_value=bad):
                with pytest.raises(ValueError):
                    summary_service.summarize(
                        diarized_prompt='x',
                        user_id='507f1f77bcf86cd799439011',
                        email_tone='formal',
                    )

    def test_openrouter_error_raises_runtimeerror(self, app, db):
        from app.services import summary_service
        with app.app_context():
            with patch('app.services.openrouter_service.OpenRouterService._sync_completion',
                       return_value={'error': {'message': 'rate limited'}}):
                with pytest.raises(RuntimeError):
                    summary_service.summarize(
                        diarized_prompt='x',
                        user_id='507f1f77bcf86cd799439011',
                        email_tone='formal',
                    )
