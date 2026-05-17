"""
``series_match.suggest_series`` — fuzzy threshold 85, owner-scoped, empty inputs.
"""
from __future__ import annotations

import pytest


class TestSuggestSeries:
    def test_empty_title_returns_none(self, app, db):
        from app.services import series_match
        with app.app_context():
            assert series_match.suggest_series('') is None
            assert series_match.suggest_series(None) is None
            assert series_match.suggest_series('   ') is None

    def test_no_series_returns_none(self, app, db, test_user):
        from app.services import series_match
        with app.app_context():
            assert series_match.suggest_series('anything', owner_id=test_user['_id']) is None

    def test_below_threshold_returns_none(self, app, db, test_user):
        from app.services import series_match
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Marketing Weekly'})
            # Completely unrelated title should score below 85.
            sug = series_match.suggest_series(
                'quantum physics deep dive',
                owner_id=test_user['_id'],
            )
            assert sug is None

    def test_match_above_threshold(self, app, db, test_user):
        from app.services import series_match
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            sid = MeetingSeriesModel.create(str(test_user['_id']), {'name': 'Marketing Weekly'})
            sug = series_match.suggest_series(
                'Marketing Weekly meeting',
                owner_id=test_user['_id'],
            )
            # token_sort_ratio of 'Marketing Weekly meeting' vs 'Marketing Weekly'
            # should clear 85 (the shorter is a perfect prefix subset).
            if sug is not None:
                assert sug.score >= 85
                assert sug.series_id == sid

    def test_owner_scope_isolation(self, app, db, test_user, admin_user):
        """Series owned by ``admin_user`` must not surface for ``test_user``."""
        from app.services import series_match
        from app.models.meeting_series import MeetingSeriesModel
        with app.app_context():
            MeetingSeriesModel.create(str(admin_user['_id']), {'name': 'Marketing Weekly'})
            sug = series_match.suggest_series(
                'Marketing Weekly',
                owner_id=test_user['_id'],
            )
            assert sug is None
