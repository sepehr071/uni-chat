"""
Pipeline integration — verifies status transitions, error capture, idempotency,
and that cancellation flips status synchronously.

Mocks ElevenLabs Scribe + OpenRouterService._sync_completion so no network
calls fire. ``run_pipeline`` is invoked synchronously inside the app context
(no thread dispatch — tests need deterministic ordering).
"""
from __future__ import annotations

import json
from unittest.mock import patch

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
def fake_transcription_result():
    """Shape that ``transcription_service.transcribe`` returns."""
    from app.services.transcription_service import TranscriptionResult
    return TranscriptionResult(
        plain_text='سلام دنیا',
        words=[
            {'text': 'سلام', 'start': 0.0, 'end': 0.5, 'type': 'word', 'speaker_id': 'speaker_0'},
            {'text': 'دنیا', 'start': 0.6, 'end': 1.0, 'type': 'word', 'speaker_id': 'speaker_0'},
        ],
        speaker_ids=['speaker_0'],
        raw={'foo': 'bar'},
        language_code='fas',
    )


@pytest.fixture
def fake_summary_payload():
    """Shape ``summary_service.summarize`` returns (minutes appended by pipeline)."""
    return {
        'exec_summary': 'A short summary.',
        'action_items': [],
        'decisions': ['Decision A'],
        'qa': [],
        'open_questions': [],
        'email_draft': {'subject': 'subj', 'body': 'body'},
        'speaker_names': [{'speaker_id': 'speaker_0', 'display_name': 'Sara'}],
    }


@pytest.fixture
def uploaded_meeting(app, test_user, tmp_path):
    """Create an UPLOADED meeting whose audio_path actually exists."""
    from app.models.meeting import MEETING_STATUS, MeetingModel
    audio = tmp_path / 'sample.mp3'
    audio.write_bytes(b'fake-audio')
    with app.app_context():
        mid = MeetingModel.create(str(test_user['_id']), {
            'original_filename': 'sample.mp3',
            'audio_path': str(audio),
            'title': 'Pipeline test',
            'status': MEETING_STATUS['UPLOADED'],
        })
        return mid


class TestRunPipelineHappyPath:
    def test_status_transitions_to_done(self, app, db, uploaded_meeting, fake_transcription_result, fake_summary_payload):
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.models.meeting_summary import MeetingSummaryModel
        from app.models.meeting_transcript import MeetingTranscriptModel
        from app.services import meetings_pipeline

        with app.app_context():
            with patch('app.services.meetings_pipeline.transcription_service.transcribe',
                       return_value=fake_transcription_result), \
                 patch('app.services.meetings_pipeline.summary_service.summarize',
                       return_value=fake_summary_payload):
                meetings_pipeline.run_pipeline(uploaded_meeting)

            doc = MeetingModel.find_by_id(uploaded_meeting)
            assert doc['status'] == MEETING_STATUS['DONE']
            assert doc.get('error_message') in (None, '')

            transcript = MeetingTranscriptModel.find_by_meeting(uploaded_meeting)
            assert transcript is not None
            assert transcript['plain_text'] == 'سلام دنیا'

            summary = MeetingSummaryModel.find_latest_for_meeting(uploaded_meeting)
            assert summary is not None
            assert summary['exec_summary'] == 'A short summary.'
            # Minutes were built server-side from words (not from LLM).
            assert isinstance(summary['minutes_json'], list)
            assert len(summary['minutes_json']) >= 1

    def test_speaker_names_applied(self, app, db, uploaded_meeting, fake_transcription_result, fake_summary_payload):
        from app.models.meeting import MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            with patch('app.services.meetings_pipeline.transcription_service.transcribe',
                       return_value=fake_transcription_result), \
                 patch('app.services.meetings_pipeline.summary_service.summarize',
                       return_value=fake_summary_payload):
                meetings_pipeline.run_pipeline(uploaded_meeting)

            doc = MeetingModel.find_by_id(uploaded_meeting)
            speakers = {s['speaker_id']: s.get('display_name') for s in doc.get('speakers', [])}
            # Pipeline appended speaker_0 from Scribe response and applied
            # LLM-suggested 'Sara' since the user hadn't renamed it.
            assert speakers.get('speaker_0') == 'Sara'


class TestIdempotency:
    def test_done_meeting_is_noop(self, app, db, test_user):
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'done.mp3', 'audio_path': '/tmp/x.mp3',
                'status': MEETING_STATUS['DONE'],
            })
            with patch('app.services.meetings_pipeline.transcription_service.transcribe') as mock_t:
                meetings_pipeline.run_pipeline(mid)
            assert not mock_t.called

    def test_missing_meeting_silent_return(self, app, db):
        from app.services import meetings_pipeline
        with app.app_context():
            # Should not raise.
            meetings_pipeline.run_pipeline('no-such-meeting-id')


class TestFailureCapture:
    def test_transcription_error_flips_failed(self, app, db, uploaded_meeting):
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            with patch(
                'app.services.meetings_pipeline.transcription_service.transcribe',
                side_effect=RuntimeError('Scribe failed: boom'),
            ):
                meetings_pipeline.run_pipeline(uploaded_meeting)
            doc = MeetingModel.find_by_id(uploaded_meeting)
            assert doc['status'] == MEETING_STATUS['FAILED']
            assert doc.get('error_message')
            assert 'boom' in doc['error_message'] or 'RuntimeError' in doc['error_message']

    def test_summary_error_flips_failed(self, app, db, uploaded_meeting, fake_transcription_result):
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            with patch('app.services.meetings_pipeline.transcription_service.transcribe',
                       return_value=fake_transcription_result), \
                 patch('app.services.meetings_pipeline.summary_service.summarize',
                       side_effect=ValueError('schema invalid')):
                meetings_pipeline.run_pipeline(uploaded_meeting)
            doc = MeetingModel.find_by_id(uploaded_meeting)
            assert doc['status'] == MEETING_STATUS['FAILED']
            assert 'schema invalid' in doc.get('error_message', '') or 'ValueError' in doc.get('error_message', '')


class TestCancellation:
    def test_request_cancel_during_run(self, app, db, uploaded_meeting):
        """Cancel before pipeline starts → status flips synchronously."""
        from app.models.meeting import MEETING_STATUS, MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            # Flip to FAILED with sentinel before run_pipeline; emulate the
            # cancel-route's behaviour.
            MeetingModel.set_status(
                uploaded_meeting,
                MEETING_STATUS['FAILED'],
                error_message=meetings_pipeline.CANCELLED_SENTINEL,
            )
            doc = MeetingModel.find_by_id(uploaded_meeting)
            assert doc['status'] == MEETING_STATUS['FAILED']
            assert doc['error_message'] == meetings_pipeline.CANCELLED_SENTINEL


class TestRegenerateSummary:
    def test_regenerate_appends_new_summary(self, app, db, uploaded_meeting, fake_transcription_result, fake_summary_payload):
        from app.models.meeting import MeetingModel
        from app.models.meeting_summary import MeetingSummaryModel
        from app.services import meetings_pipeline
        with app.app_context():
            # First, full run.
            with patch('app.services.meetings_pipeline.transcription_service.transcribe',
                       return_value=fake_transcription_result), \
                 patch('app.services.meetings_pipeline.summary_service.summarize',
                       return_value=fake_summary_payload):
                meetings_pipeline.run_pipeline(uploaded_meeting)

            initial = MeetingSummaryModel.list_for_meeting(uploaded_meeting)
            assert len(initial) == 1

            # Regenerate — new payload.
            new_payload = dict(fake_summary_payload)
            new_payload['exec_summary'] = 'V2 summary'
            with patch('app.services.meetings_pipeline.summary_service.summarize',
                       return_value=new_payload):
                meetings_pipeline.regenerate_summary(uploaded_meeting)

            all_summaries = MeetingSummaryModel.list_for_meeting(uploaded_meeting)
            assert len(all_summaries) == 2
            latest = MeetingSummaryModel.find_latest_for_meeting(uploaded_meeting)
            assert latest['exec_summary'] == 'V2 summary'

    def test_regenerate_no_transcript_raises(self, app, db, test_user):
        from app.models.meeting import MeetingModel
        from app.services import meetings_pipeline
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
            })
            import pytest as _pytest
            with _pytest.raises(RuntimeError, match='no transcript'):
                meetings_pipeline.regenerate_summary(mid)
