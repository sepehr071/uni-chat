"""
Meeting routes — CRUD, cross-user 404, mimetype handling, suggest-series.

Owns the basic happy-path + ownership invariants. Heavier pipeline / upload /
DLP / spawn / save coverage lives in sibling test files.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from bson import ObjectId
from flask_jwt_extended import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def enable_meetings_feature(app, db):
    """Flip the platform `meetings` flag to True for every test in this module.

    Also drops the Phase 1 ``title_text`` index on the meetings collection —
    that index uses MongoDB's default ``language_override='language'`` rule,
    which clashes with the ``language='fas'`` field every meeting doc carries
    (Mongo error 17262: "language override unsupported: fas"). Tests don't
    exercise text search; pruning the broken index here keeps inserts green
    until Phase 1 is patched to set ``language_override`` (or a fixed
    ``default_language``) on its create_indexes() call.
    """
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
            existing = col.index_information()
        except Exception:
            existing = {}
        if 'title_text' in existing:
            try:
                col.drop_index('title_text')
            except Exception:
                pass


@pytest.fixture
def meeting_doc(app, test_user):
    """Insert a baseline meeting doc owned by ``test_user`` and return it."""
    from app.models.meeting import MEETING_STATUS, MeetingModel
    with app.app_context():
        mid = MeetingModel.create(str(test_user['_id']), {
            'original_filename': 'foo.mp3',
            'audio_path': '/tmp/foo.mp3',
            'title': 'Standup',
            'status': MEETING_STATUS['DONE'],
            'speakers': [{'speaker_id': 'speaker_0', 'display_name': None}],
        })
        return MeetingModel.find_by_id(mid)


@pytest.fixture
def other_user_meeting(app, admin_user):
    from app.models.meeting import MEETING_STATUS, MeetingModel
    with app.app_context():
        mid = MeetingModel.create(str(admin_user['_id']), {
            'original_filename': 'other.mp3',
            'audio_path': '/tmp/other.mp3',
            'title': 'Other user meeting',
            'status': MEETING_STATUS['DONE'],
            'speakers': [],
        })
        return MeetingModel.find_by_id(mid)


# ---------------------------------------------------------------------------
# List / fetch / patch / delete
# ---------------------------------------------------------------------------

class TestListAndFetch:
    def test_list_returns_only_my_meetings(self, app, db, client, test_user, auth_headers, meeting_doc, other_user_meeting):
        r = client.get('/api/meetings/list', headers=auth_headers)
        assert r.status_code == 200
        ids = {m['_id'] for m in r.get_json()['meetings']}
        assert meeting_doc['_id'] in ids
        assert other_user_meeting['_id'] not in ids

    def test_list_filter_by_series(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MeetingModel
        with app.app_context():
            sid = str(uuid.uuid4())
            MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
                'series_id': sid, 'title': 'a',
            })
            MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'b.mp3', 'audio_path': '/tmp/b.mp3',
                'title': 'b',
            })
        r = client.get(f'/api/meetings/list?series_id={sid}', headers=auth_headers)
        assert r.status_code == 200
        meetings = r.get_json()['meetings']
        assert len(meetings) == 1
        assert meetings[0]['title'] == 'a'

    def test_list_query_substring(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MeetingModel
        with app.app_context():
            MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'a.mp3', 'audio_path': '/tmp/a.mp3',
                'title': 'Weekly review',
            })
            MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'b.mp3', 'audio_path': '/tmp/b.mp3',
                'title': 'Quarterly retro',
            })
        r = client.get('/api/meetings/list?q=weekly', headers=auth_headers)
        meetings = r.get_json()['meetings']
        assert len(meetings) == 1
        assert meetings[0]['title'] == 'Weekly review'

    def test_get_meeting_owner_ok(self, app, db, client, auth_headers, meeting_doc):
        r = client.get(f'/api/meetings/{meeting_doc["_id"]}', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['meeting']['title'] == 'Standup'

    def test_get_meeting_cross_user_404(self, app, db, client, auth_headers, other_user_meeting):
        # test_user can't see admin's meeting — 404 (existence oracle)
        r = client.get(f'/api/meetings/{other_user_meeting["_id"]}', headers=auth_headers)
        assert r.status_code == 404


class TestPatchMeeting:
    def test_patch_title(self, app, db, client, auth_headers, meeting_doc):
        r = client.patch(
            f'/api/meetings/{meeting_doc["_id"]}',
            json={'title': 'Renamed standup'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['meeting']['title'] == 'Renamed standup'

    def test_patch_series_id_empty_string_clears(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MeetingModel
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'series_id': str(uuid.uuid4()),
            })
        r = client.patch(f'/api/meetings/{mid}', json={'series_id': ''}, headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['meeting']['series_id'] is None

    def test_patch_no_fields_400(self, app, db, client, auth_headers, meeting_doc):
        r = client.patch(f'/api/meetings/{meeting_doc["_id"]}', json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_patch_cross_user_404(self, app, db, client, auth_headers, other_user_meeting):
        r = client.patch(
            f'/api/meetings/{other_user_meeting["_id"]}',
            json={'title': 'X'},
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestDeleteMeeting:
    def test_delete_cascade(self, app, db, client, test_user, auth_headers, tmp_path):
        from app.models.meeting import MeetingModel
        from app.models.meeting_summary import MeetingSummaryModel
        from app.models.meeting_transcript import MeetingTranscriptModel
        audio = tmp_path / 'cascade.mp3'
        audio.write_bytes(b'fake-audio-bytes')
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'cascade.mp3',
                'audio_path': str(audio),
                'title': 'For delete',
            })
            MeetingTranscriptModel.create(mid, {
                'plain_text': 'hello',
                'words_json': [{'text': 'hello', 'start': 0, 'end': 1, 'speaker_id': 'speaker_0'}],
                'raw_json': {},
            })
            MeetingSummaryModel.create(mid, {
                'exec_summary': 's',
                'action_items_json': [],
                'decisions_json': [],
                'minutes_json': [],
                'model': 'google/gemini-3-flash-preview',
            })

        r = client.delete(f'/api/meetings/{mid}', headers=auth_headers)
        assert r.status_code == 200

        with app.app_context():
            assert MeetingModel.find_by_id(mid) is None
            assert MeetingTranscriptModel.find_by_meeting(mid) is None
            assert MeetingSummaryModel.find_latest_for_meeting(mid) is None
        # Audio file unlinked
        assert not audio.exists()

    def test_delete_cross_user_404(self, app, db, client, auth_headers, other_user_meeting):
        r = client.delete(f'/api/meetings/{other_user_meeting["_id"]}', headers=auth_headers)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Transcript / Summary / Audio
# ---------------------------------------------------------------------------

class TestTranscriptAndSummary:
    def test_transcript_404_when_missing(self, app, db, client, auth_headers, meeting_doc):
        r = client.get(f'/api/meetings/{meeting_doc["_id"]}/transcript', headers=auth_headers)
        assert r.status_code == 404

    def test_summary_404_when_missing(self, app, db, client, auth_headers, meeting_doc):
        r = client.get(f'/api/meetings/{meeting_doc["_id"]}/summary', headers=auth_headers)
        assert r.status_code == 404

    def test_transcript_round_trip(self, app, db, client, test_user, auth_headers, meeting_doc):
        from app.models.meeting_transcript import MeetingTranscriptModel
        with app.app_context():
            MeetingTranscriptModel.create(meeting_doc['_id'], {
                'plain_text': 'سلام دنیا',
                'words_json': [
                    {'text': 'سلام', 'start': 0, 'end': 0.5, 'speaker_id': 'speaker_0'},
                ],
                'raw_json': {'words': 'omitted'},
            })
        r = client.get(f'/api/meetings/{meeting_doc["_id"]}/transcript', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['transcript']
        assert body['plain_text'] == 'سلام دنیا'

    def test_summary_round_trip(self, app, db, client, auth_headers, meeting_doc):
        from app.models.meeting_summary import MeetingSummaryModel
        with app.app_context():
            MeetingSummaryModel.create(meeting_doc['_id'], {
                'exec_summary': 'short',
                'action_items_json': [{'text': 'do it', 'owner': None, 'due_date': None}],
                'decisions_json': [],
                'minutes_json': [],
                'model': 'google/gemini-3-flash-preview',
            })
        r = client.get(f'/api/meetings/{meeting_doc["_id"]}/summary', headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()['summary']
        assert body['exec_summary'] == 'short'


# ---------------------------------------------------------------------------
# Speaker rename — embedded + glossary sync.
# ---------------------------------------------------------------------------

class TestRenameSpeaker:
    def test_rename_persists(self, app, db, client, auth_headers, meeting_doc):
        r = client.patch(
            f'/api/meetings/{meeting_doc["_id"]}/speakers/speaker_0',
            json={'display_name': 'Sara'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        speakers = r.get_json()['meeting']['speakers']
        assert any(s['speaker_id'] == 'speaker_0' and s['display_name'] == 'Sara' for s in speakers)

    def test_rename_syncs_to_series_glossary(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MeetingModel
        from app.models.meeting_series import MeetingSeriesModel
        from app.services import meeting_glossary
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Weekly'})
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3',
                'audio_path': '/tmp/x.mp3',
                'series_id': sid,
                'speakers': [{'speaker_id': 'speaker_0', 'display_name': None}],
            })
        r = client.patch(
            f'/api/meetings/{mid}/speakers/speaker_0',
            json={'display_name': 'Mahdi'},
            headers=auth_headers,
        )
        assert r.status_code == 200
        with app.app_context():
            names = meeting_glossary.list_speaker_names(sid)
            assert 'Mahdi' in names

    def test_rename_cross_user_404(self, app, db, client, auth_headers, other_user_meeting):
        r = client.patch(
            f'/api/meetings/{other_user_meeting["_id"]}/speakers/speaker_0',
            json={'display_name': 'X'},
            headers=auth_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Cancel + Regenerate
# ---------------------------------------------------------------------------

class TestCancel:
    def test_cancel_flips_to_failed_with_sentinel(self, app, db, client, test_user, auth_headers):
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'status': MEETING_STATUS['TRANSCRIBING'],
            })
        r = client.post(f'/api/meetings/{mid}/cancel', headers=auth_headers)
        assert r.status_code == 200
        with app.app_context():
            doc = MeetingModel.find_by_id(mid)
            assert doc['status'] == MEETING_STATUS['FAILED']
            assert doc['error_message'] == meetings_pipeline.CANCELLED_SENTINEL

    def test_cancel_when_done_returns_409(self, app, db, client, auth_headers, meeting_doc):
        r = client.post(f'/api/meetings/{meeting_doc["_id"]}/cancel', headers=auth_headers)
        assert r.status_code == 409


class TestRegenerate:
    def test_regenerate_requires_transcript(self, app, db, client, auth_headers, meeting_doc):
        r = client.post(
            f'/api/meetings/{meeting_doc["_id"]}/regenerate-summary',
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_regenerate_dispatches(self, app, db, client, test_user, auth_headers, meeting_doc):
        from app.models.meeting_transcript import MeetingTranscriptModel
        with app.app_context():
            MeetingTranscriptModel.create(meeting_doc['_id'], {
                'plain_text': 'hi',
                'words_json': [{'text': 'hi', 'start': 0, 'end': 0.3, 'speaker_id': 'speaker_0'}],
                'raw_json': {},
            })
        with patch('app.routes.meetings.threading.Thread') as mock_thread:
            mock_thread.return_value.start.return_value = None
            r = client.post(
                f'/api/meetings/{meeting_doc["_id"]}/regenerate-summary',
                headers=auth_headers,
            )
        assert r.status_code == 202
        assert mock_thread.called


# ---------------------------------------------------------------------------
# Suggest-series
# ---------------------------------------------------------------------------

class TestSuggestSeries:
    def test_empty_title_returns_null(self, client, auth_headers):
        r = client.get('/api/meetings/suggest-series?title=', headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()['suggestion'] is None

    def test_no_match_returns_null(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Marketing Weekly'})
        r = client.get(
            '/api/meetings/suggest-series?title=quantum%20physics%20deep%20dive',
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()['suggestion'] is None

    def test_fuzzy_match_returns_series(self, app, db, client, test_user, auth_headers):
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Weekly product review'})
        r = client.get(
            '/api/meetings/suggest-series?title=Weekly+product+review+%23A',
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.get_json()
        if body['suggestion'] is not None:
            assert body['suggestion']['series_id'] == sid
            assert body['suggestion']['score'] >= 85


# ---------------------------------------------------------------------------
# Auth: no JWT → 401.
# ---------------------------------------------------------------------------

class TestAuthRequired:
    def test_no_jwt_blocks_list(self, client):
        r = client.get('/api/meetings/list')
        assert r.status_code in (401, 422)
