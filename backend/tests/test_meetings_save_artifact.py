"""
POST /api/meetings/<id>/save-artifact — creates KnowledgeItem with
``source_type='meeting'`` and auto-creates a folder named after the meeting on
the first save.
"""
from __future__ import annotations

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
def meeting_with_summary(app, test_user):
    from app.models.meeting import MEETING_STATUS, MeetingModel
    from app.models.meeting_summary import MeetingSummaryModel
    with app.app_context():
        mid = MeetingModel.create(str(test_user['_id']), {
            'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
            'title': 'Q1 retro',
            'status': MEETING_STATUS['DONE'],
        })
        MeetingSummaryModel.create(mid, {
            'exec_summary': 'Exec summary text',
            'action_items_json': [{'text': 'Ship X', 'owner': 'Sara', 'due_date': None}],
            'decisions_json': ['Buy more ads'],
            'minutes_json': [{'speaker_id': 'speaker_0', 'text': 'hi', 'start_s': 0, 'end_s': 1}],
            'qa_json': [{'question': 'Q', 'answer': 'A'}],
            'open_questions_json': [{'question': 'who?', 'owner': None}],
            'email_draft': 'See you',
            'email_subject': 'Recap',
            'email_tone': 'formal',
            'model': 'google/gemini-3-flash-preview',
        })
        return mid


class TestSaveArtifact:
    def test_save_action_items_autocreates_folder(self, app, db, client, test_user, auth_headers, meeting_with_summary):
        r = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'action_items'},
            headers=auth_headers,
        )
        assert r.status_code == 201
        body = r.get_json()
        assert body['folder_id']

        from app.models.knowledge_folder import KnowledgeFolderModel
        from app.models.knowledge_item import KnowledgeItemModel
        from bson import ObjectId
        with app.app_context():
            folder = KnowledgeFolderModel.find_by_id(body['folder_id'])
            assert folder is not None
            assert folder['name'] == 'Q1 retro'

            items, _ = KnowledgeItemModel.find_by_user(str(test_user['_id']))
            assert len(items) == 1
            assert items[0]['source']['type'] == 'meeting'
            assert items[0]['source']['meeting_id'] == meeting_with_summary
            assert items[0]['source']['artifact_kind'] == 'action_items'

    def test_save_uses_existing_folder_on_second_call(self, app, db, client, test_user, auth_headers, meeting_with_summary):
        r1 = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'exec_summary'},
            headers=auth_headers,
        )
        r2 = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'decisions'},
            headers=auth_headers,
        )
        assert r1.status_code == 201
        assert r2.status_code == 201
        # Same folder reused.
        assert r1.get_json()['folder_id'] == r2.get_json()['folder_id']

        from app.models.knowledge_folder import KnowledgeFolderModel
        with app.app_context():
            all_folders = KnowledgeFolderModel.find_by_user(str(test_user['_id']))
            named_folders = [f for f in all_folders if f['name'] == 'Q1 retro']
            assert len(named_folders) == 1

    def test_save_invalid_kind_400(self, app, db, client, auth_headers, meeting_with_summary):
        r = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'not-a-real-kind'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_save_no_content_for_kind_400(self, app, db, client, test_user, auth_headers):
        """No summary yet → action_items artifact has no source content."""
        from app.models.meeting import MeetingModel
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
                'title': 'no summary',
            })
        r = client.post(
            f'/api/meetings/{mid}/save-artifact',
            json={'artifact_kind': 'action_items'},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_save_to_user_supplied_folder(self, app, db, client, test_user, auth_headers, meeting_with_summary):
        from app.models.knowledge_folder import KnowledgeFolderModel
        with app.app_context():
            folder = KnowledgeFolderModel.create(
                user_id=str(test_user['_id']), name='My existing folder',
            )
            folder_id = str(folder['_id'])
        r = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'exec_summary', 'folder_id': folder_id},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert r.get_json()['folder_id'] == folder_id

    def test_save_transcript_when_present(self, app, db, client, test_user, auth_headers, meeting_with_summary):
        from app.models.meeting_transcript import MeetingTranscriptModel
        with app.app_context():
            MeetingTranscriptModel.create(meeting_with_summary, {
                'plain_text': 'سلام جلسه',
                'words_json': [],
                'raw_json': {},
            })
        r = client.post(
            f'/api/meetings/{meeting_with_summary}/save-artifact',
            json={'artifact_kind': 'transcript'},
            headers=auth_headers,
        )
        assert r.status_code == 201
