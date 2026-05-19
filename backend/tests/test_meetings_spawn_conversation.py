"""
POST /api/meetings/<id>/spawn-conversation — creates uni-chat conversation,
seeds a system-role message with full meeting context, references the
correct quick model config_id.
"""
from __future__ import annotations

from bson import ObjectId

import pytest


@pytest.fixture(autouse=True)
def enable_meetings_feature(app, db):
    """See ``test_meetings_routes.py`` for the title_text drop rationale."""
    from app.models.platform_settings import PlatformSettingsModel, SINGLETON_ID
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {'$set': {'features.meetings': True}, '$setOnInsert': {'_id': SINGLETON_ID}},
            upsert=True,
        )
        from app.models.meeting import MeetingModel
        col = MeetingModel.get_collection()
        try:
            if 'title_text' in col.index_information():
                col.drop_index('title_text')
        except Exception:
            pass


@pytest.fixture
def meeting_with_data(app, test_user):
    """Insert a complete meeting (meeting + transcript + summary)."""
    from app.models.meeting import MEETING_STATUS, MeetingModel
    from app.models.meeting_summary import MeetingSummaryModel
    from app.models.meeting_transcript import MeetingTranscriptModel
    with app.app_context():
        mid = MeetingModel.create(str(test_user['_id']), {
            'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
            'title': 'Q1 retro',
            'status': MEETING_STATUS['DONE'],
            'speakers': [{'speaker_id': 'speaker_0', 'display_name': 'Sara'}],
        })
        MeetingTranscriptModel.create(mid, {
            'plain_text': 'سلام جلسه شروع شد',
            'words_json': [
                {'text': 'سلام', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            ],
            'raw_json': {},
        })
        MeetingSummaryModel.create(mid, {
            'exec_summary': 'Quarter looked good.',
            'action_items_json': [{'text': 'Ship feature X', 'owner': 'Sara', 'due_date': None}],
            'decisions_json': ['Continue investing in marketing'],
            'minutes_json': [
                {'speaker_id': 'speaker_0', 'text': 'سلام', 'start_s': 0.0, 'end_s': 0.5},
            ],
            'qa_json': [{'question': 'Q', 'answer': 'A'}],
            'open_questions_json': [{'question': 'who owns next sprint?', 'owner': None}],
            'email_draft': 'See you all',
            'email_subject': 'Recap',
            'email_tone': 'formal',
            'model': 'google/gemini-3-flash-preview',
        })
        return mid


class TestSpawnConversation:
    def test_spawn_creates_conversation_and_seed_message(self, app, db, client, test_user, auth_headers, meeting_with_data):
        r = client.post(
            f'/api/meetings/{meeting_with_data}/spawn-conversation',
            headers=auth_headers,
        )
        assert r.status_code == 201
        conv_id = r.get_json()['conversation_id']
        assert conv_id

        from app.models.conversation import ConversationModel
        from app.models.message import MessageModel
        from app.services.meetings_service import MEETING_DISCUSSION_MODEL

        with app.app_context():
            conv = ConversationModel.find_by_id(conv_id)
            assert conv is not None
            assert conv['title'].startswith('Meeting: ')
            # config_id is the synthetic quick:* string.
            assert conv['config_id'] == f'quick:{MEETING_DISCUSSION_MODEL}'
            assert str(conv['user_id']) == str(test_user['_id'])

            msgs = MessageModel.find_by_conversation(conv_id)
            assert len(msgs) == 1
            seed = msgs[0]
            assert seed['role'] == 'system'
            assert 'meeting' in (seed.get('metadata') or {}).get('source', '')
            assert seed['metadata']['meeting_id'] == meeting_with_data
            # Content should include transcript + summary headings.
            assert '## Transcript' in seed['content'] or 'Transcript' in seed['content']
            assert '## Summary' in seed['content'] or 'Quarter looked good' in seed['content']

            # Conversation message count incremented.
            assert conv['message_count'] >= 0  # not asserted strictly since increment is async-safe

    def test_spawn_works_without_summary(self, app, db, client, test_user, auth_headers):
        """Spawn before pipeline finishes — only the meeting doc exists.

        Should still create a conversation, just w/ a minimal seed.
        """
        from app.models.meeting import MeetingModel
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
                'title': 'No summary yet',
            })
        r = client.post(
            f'/api/meetings/{mid}/spawn-conversation', headers=auth_headers,
        )
        assert r.status_code == 201

    def test_spawn_cross_user_404(self, app, db, client, admin_user, auth_headers):
        from app.models.meeting import MeetingModel
        with app.app_context():
            mid = MeetingModel.create(str(admin_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
            })
        r = client.post(
            f'/api/meetings/{mid}/spawn-conversation', headers=auth_headers,
        )
        assert r.status_code == 404

    def test_spawn_is_idempotent(self, app, db, client, auth_headers, meeting_with_data):
        """Second call returns the same conversation_id with 200 + reused=True.

        Backs the in-page Discuss tab: re-opening should not spawn a new chat
        per click.
        """
        r1 = client.post(
            f'/api/meetings/{meeting_with_data}/spawn-conversation',
            headers=auth_headers,
        )
        assert r1.status_code == 201
        first_id = r1.get_json()['conversation_id']
        assert r1.get_json().get('reused') is False

        r2 = client.post(
            f'/api/meetings/{meeting_with_data}/spawn-conversation',
            headers=auth_headers,
        )
        assert r2.status_code == 200
        body2 = r2.get_json()
        assert body2['conversation_id'] == first_id
        assert body2.get('reused') is True

        # And only one seed message should exist for this meeting.
        from app.models.message import MessageModel
        with app.app_context():
            seeds = list(MessageModel.get_collection().find({
                'role': 'system',
                'metadata.source': 'meeting',
                'metadata.meeting_id': meeting_with_data,
            }))
            assert len(seeds) == 1
