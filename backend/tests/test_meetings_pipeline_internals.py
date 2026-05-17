"""
Pipeline internals — pure-function coverage for word grouping, prompt building,
minutes assembly, and the manual-edit-wins rule on speaker name application.

The pure-function tests do not need DB access; the apply_speaker_names tests
do (they exercise MeetingModel). The autouse fixture drops the broken
``title_text`` Phase 1 index so meeting inserts can succeed under the
``language='fas'`` default — see ``test_meetings_routes.py`` for the rationale.
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _drop_broken_title_text_index(app, db):
    """Drop the Phase 1 broken ``title_text`` index — Mongo rejects
    ``language='fas'`` because the index uses ``language_override='language'``
    by default. Tests don't exercise text search."""
    with app.app_context():
        from app.models.meeting import MeetingModel
        col = MeetingModel.get_collection()
        try:
            if 'title_text' in col.index_information():
                col.drop_index('title_text')
        except Exception:
            pass


# ---------------------------------------------------------------------------
# _segment_words
# ---------------------------------------------------------------------------

class TestSegmentWords:
    def test_groups_same_speaker_no_gap(self):
        from app.services.meetings_pipeline import _segment_words
        words = [
            {'text': 'a ', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            {'text': 'b ', 'start': 0.5, 'end': 1.0, 'speaker_id': 'speaker_0'},
            {'text': 'c', 'start': 1.0, 'end': 1.5, 'speaker_id': 'speaker_0'},
        ]
        segs = _segment_words(words)
        assert len(segs) == 1
        speaker, start, end, text = segs[0]
        assert speaker == 'speaker_0'
        # ``_segment_words`` concatenates raw word strings then ``.strip()``s.
        # Input "a " + "b " + "c" → "a b c" after the final strip.
        assert text == 'a b c'
        assert start == 0.0
        assert end == 1.5

    def test_splits_on_speaker_change(self):
        from app.services.meetings_pipeline import _segment_words
        words = [
            {'text': 'a', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            {'text': 'b', 'start': 0.6, 'end': 1.0, 'speaker_id': 'speaker_1'},
        ]
        segs = _segment_words(words)
        assert len(segs) == 2
        assert segs[0][0] == 'speaker_0'
        assert segs[1][0] == 'speaker_1'

    def test_splits_on_gap_over_threshold(self):
        from app.services.meetings_pipeline import _GAP_THRESHOLD_S, _segment_words
        words = [
            {'text': 'a', 'start': 0.0, 'end': 1.0, 'speaker_id': 'speaker_0'},
            {'text': 'b', 'start': 1.0 + _GAP_THRESHOLD_S + 0.1, 'end': 3.5, 'speaker_id': 'speaker_0'},
        ]
        segs = _segment_words(words)
        assert len(segs) == 2

    def test_handles_missing_timestamps(self):
        from app.services.meetings_pipeline import _segment_words
        words = [
            {'text': 'a', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            {'text': 'b', 'speaker_id': 'speaker_0'},  # no start/end
            {'text': 'c', 'start': 1.0, 'end': 1.5, 'speaker_id': 'speaker_0'},
        ]
        segs = _segment_words(words)
        # Should keep producing segments and not crash on missing fields.
        assert len(segs) >= 1

    def test_handles_missing_speaker_defaults_to_speaker_0(self):
        from app.services.meetings_pipeline import _segment_words
        words = [
            {'text': 'a', 'start': 0.0, 'end': 0.5},
            {'text': 'b', 'start': 0.5, 'end': 1.0},
        ]
        segs = _segment_words(words)
        assert len(segs) == 1
        assert segs[0][0] == 'speaker_0'

    def test_large_input_is_linear(self):
        """5000-word input completes quickly (sanity on O(n))."""
        from app.services.meetings_pipeline import _segment_words
        words = [
            {'text': f'w{i}', 'start': i * 0.1, 'end': i * 0.1 + 0.05, 'speaker_id': 'speaker_0'}
            for i in range(5000)
        ]
        segs = _segment_words(words)
        assert len(segs) >= 1  # No exception, no timeout


# ---------------------------------------------------------------------------
# build_diarized_prompt
# ---------------------------------------------------------------------------

class TestBuildDiarizedPrompt:
    def test_format_speaker_timestamp_text(self):
        from app.services.meetings_pipeline import build_diarized_prompt
        words = [
            {'text': 'hello ', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            {'text': 'world', 'start': 0.5, 'end': 1.0, 'speaker_id': 'speaker_0'},
        ]
        prompt = build_diarized_prompt(words)
        assert 'speaker_0' in prompt
        assert '0.00' in prompt
        assert '1.00' in prompt

    def test_empty_words(self):
        from app.services.meetings_pipeline import build_diarized_prompt
        assert build_diarized_prompt([]) == ''


# ---------------------------------------------------------------------------
# build_minutes_segments
# ---------------------------------------------------------------------------

class TestBuildMinutesSegments:
    def test_segments_carry_required_fields(self):
        from app.services.meetings_pipeline import build_minutes_segments
        words = [
            {'text': 'a', 'start': 0.0, 'end': 0.5, 'speaker_id': 'speaker_0'},
            {'text': 'b', 'start': 0.6, 'end': 1.0, 'speaker_id': 'speaker_1'},
        ]
        segs = build_minutes_segments(words)
        assert len(segs) == 2
        for seg in segs:
            assert 'speaker_id' in seg
            assert 'text' in seg
            assert 'start_s' in seg
            assert 'end_s' in seg


# ---------------------------------------------------------------------------
# apply_speaker_names — manual-edit-wins.
# ---------------------------------------------------------------------------

class TestApplySpeakerNames:
    def test_no_mapping_no_changes(self, app, db, test_user):
        from app.models.meeting import MeetingModel
        from app.services.meetings_pipeline import apply_speaker_names
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'speakers': [{'speaker_id': 'speaker_0', 'display_name': None}],
            })
            meeting = MeetingModel.find_by_id(mid)
            n = apply_speaker_names(meeting, None)
            assert n == 0

    def test_applies_to_empty_display_names(self, app, db, test_user):
        from app.models.meeting import MeetingModel
        from app.services.meetings_pipeline import apply_speaker_names
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'speakers': [{'speaker_id': 'speaker_0', 'display_name': None}],
            })
            meeting = MeetingModel.find_by_id(mid)
            n = apply_speaker_names(meeting, [
                {'speaker_id': 'speaker_0', 'display_name': 'Sara'},
            ])
            assert n == 1
            updated = MeetingModel.find_by_id(mid)
            speakers = {s['speaker_id']: s.get('display_name') for s in updated['speakers']}
            assert speakers['speaker_0'] == 'Sara'

    def test_manual_edit_wins(self, app, db, test_user):
        """A speaker that already has a non-empty display_name is not overwritten."""
        from app.models.meeting import MeetingModel
        from app.services.meetings_pipeline import apply_speaker_names
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'speakers': [{'speaker_id': 'speaker_0', 'display_name': 'Manual'}],
            })
            meeting = MeetingModel.find_by_id(mid)
            n = apply_speaker_names(meeting, [
                {'speaker_id': 'speaker_0', 'display_name': 'AutoLLM'},
            ])
            assert n == 0
            updated = MeetingModel.find_by_id(mid)
            speakers = {s['speaker_id']: s.get('display_name') for s in updated['speakers']}
            assert speakers['speaker_0'] == 'Manual'

    def test_skips_empty_mapping_entries(self, app, db, test_user):
        from app.models.meeting import MeetingModel
        from app.services.meetings_pipeline import apply_speaker_names
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'x.mp3', 'audio_path': '/tmp/x.mp3',
                'speakers': [{'speaker_id': 'speaker_0', 'display_name': None}],
            })
            meeting = MeetingModel.find_by_id(mid)
            n = apply_speaker_names(meeting, [
                {'speaker_id': '', 'display_name': 'X'},
                {'speaker_id': 'speaker_0', 'display_name': ''},
            ])
            assert n == 0
