"""
Meeting glossary tests — manual add dedup, SUGGESTED → MANUAL promotion,
batch caps, Persian token validation, accept/reject.
"""
from __future__ import annotations

import pytest


@pytest.fixture
def series(app, db, test_user):
    from app.models.meeting_series import MeetingSeriesModel
    with app.app_context():
        sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Weekly'})
        return sid


class TestAddManualTerm:
    def test_add_persists(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            doc = meeting_glossary.add_manual_term(series, 'دستاورد')
            assert doc is not None
            assert doc['term'] == 'دستاورد'
            assert doc['source'] == 'manual'

    def test_duplicate_returns_existing(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            first = meeting_glossary.add_manual_term(series, 'دستاورد')
            second = meeting_glossary.add_manual_term(series, 'دستاورد')
            assert second['_id'] == first['_id']

    def test_promotes_suggested_to_manual(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.add_suggested_terms(series, ['پروژه'])
            doc = meeting_glossary.add_manual_term(series, 'پروژه')
            assert doc['source'] == 'manual'

    def test_validation_rejects_too_short(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            doc = meeting_glossary.add_manual_term(series, 'a')
            assert doc is None

    def test_validation_rejects_too_many_words(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            long_term = 'a b c d e f g'  # 7 words > KEYTERM_MAX_WORDS=5
            doc = meeting_glossary.add_manual_term(series, long_term)
            assert doc is None

    def test_validation_rejects_numeric_only(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            doc = meeting_glossary.add_manual_term(series, '12345')
            assert doc is None

    def test_validation_rejects_too_long(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            very_long = 'a' * 60
            doc = meeting_glossary.add_manual_term(series, very_long)
            assert doc is None


class TestAddSuggestedTerms:
    def test_adds_valid_terms_only(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            added = meeting_glossary.add_suggested_terms(series, ['پروژه', 'a', '12345'])
            assert added == 1
            terms = meeting_glossary.list_keyterms(series, source='suggested')
            term_strs = [t['term'] for t in terms]
            assert 'پروژه' in term_strs

    def test_existing_manual_not_overwritten(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.add_manual_term(series, 'پروژه')
            meeting_glossary.add_suggested_terms(series, ['پروژه'])
            rows = meeting_glossary.list_keyterms(series)
            existing = [r for r in rows if r['term'] == 'پروژه']
            assert len(existing) == 1
            assert existing[0]['source'] == 'manual'


class TestAcceptRejectTerm:
    def test_accept_promotes_to_accepted(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.add_suggested_terms(series, ['پروژه'])
            row = meeting_glossary.list_keyterms(series, source='suggested')[0]
            ok = meeting_glossary.accept_term(row['_id'])
            assert ok
            assert meeting_glossary.list_keyterms(series, source='accepted')[0]['term'] == 'پروژه'

    def test_reject_deletes(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.add_suggested_terms(series, ['پروژه'])
            row = meeting_glossary.list_keyterms(series, source='suggested')[0]
            ok = meeting_glossary.reject_term(row['_id'])
            assert ok
            assert meeting_glossary.list_keyterms(series, source='suggested') == []


class TestActiveKeyterms:
    def test_returns_manual_and_accepted(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.add_manual_term(series, 'manualterm')
            meeting_glossary.add_suggested_terms(series, ['suggestedterm'])
            # Accept the suggested one.
            row = meeting_glossary.list_keyterms(series, source='suggested')[0]
            meeting_glossary.accept_term(row['_id'])
            meeting_glossary.add_suggested_terms(series, ['onlysuggested'])

            active = meeting_glossary.get_active_keyterms(series)
            assert 'manualterm' in active
            assert 'suggestedterm' in active
            assert 'onlysuggested' not in active


class TestSpeakerNameMemory:
    def test_upsert_persists(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.upsert_speaker_name(series, 'Sara')
            names = meeting_glossary.list_speaker_names(series)
            assert 'Sara' in names

    def test_upsert_dedups(self, app, db, series):
        from app.services import meeting_glossary
        with app.app_context():
            meeting_glossary.upsert_speaker_name(series, 'Sara')
            meeting_glossary.upsert_speaker_name(series, 'Sara')
            names = meeting_glossary.list_speaker_names(series)
            assert names.count('Sara') == 1
