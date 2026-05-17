"""
DLP gate plumbing — v1 is personal-scope (no workspace_id), so the gate is a
no-op. This test asserts the call shape (source='meeting') would route through
the same chokepoint if a workspace_id were ever attached.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def enable_meetings_feature(app, db):
    from app.models.platform_settings import PlatformSettingsModel, SINGLETON_ID
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {'$set': {'features.meetings': True}, '$setOnInsert': {'_id': SINGLETON_ID}},
            upsert=True,
        )


class TestDLPGateNoOp:
    def test_no_workspace_returns_none(self, app, db):
        """When workspace_id is None (personal-scope v1), the gate short-circuits."""
        from app.services.dlp_gate import gate
        with app.app_context():
            result = gate(
                text='Some sensitive transcript text',
                user_id='507f1f77bcf86cd799439011',
                workspace_id=None,
                source='meeting',
                source_ref={'meeting_id': 'm1', 'phase': 'transcript'},
            )
            assert result is None

    def test_empty_text_returns_none(self, app, db):
        from app.services.dlp_gate import gate
        with app.app_context():
            result = gate(
                text='',
                user_id='507f1f77bcf86cd799439011',
                workspace_id='507f1f77bcf86cd799439012',
                source='meeting',
                source_ref={'meeting_id': 'm1'},
            )
            assert result is None


class TestDLPBlockedErrorShape:
    def test_dlp_blocked_format_response_body_shape(self, app, db):
        """Sanity: ``format_blocked_response`` shapes the body we'd surface to
        callers; useful to keep stable since the meetings UI parses ``matches``.
        """
        from app.services.dlp_gate import DLPBlockedError, format_blocked_response
        err = DLPBlockedError(code='dlp_blocked', matches=[
            {
                'rule_id': 'r1',
                'rule_name': 'fake',
                'severity': 'critical',
                'action': 'block',
                'offset_start': 0,
                'offset_end': 4,
                'snippet': 'XXXX',
            }
        ])
        body = format_blocked_response(err)
        assert body['code'] == 'dlp_blocked'
        assert body['matches'][0]['rule_id'] == 'r1'
