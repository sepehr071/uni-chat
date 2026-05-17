"""
Series fuzzy-suggester — match an incoming meeting title against a user's
existing recurring-series names. Backed by rapidfuzz's
``token_sort_ratio`` so reordered / partial titles still match.

Threshold defaults to 85 (out of 100) — anything below returns ``None``.

``meeting_series._id`` is a UUID4 string (BA1 model), so suggestions
return ``series_id`` as a string. ``owner_id`` is stored as ObjectId.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from bson import ObjectId

from app.extensions import mongo

DEFAULT_THRESHOLD = 85.0


@dataclass
class SeriesSuggestion:
    series_id: str
    name: str
    score: float


def _user_oid(user_id) -> ObjectId | None:
    if user_id is None:
        return None
    if isinstance(user_id, ObjectId):
        return user_id
    try:
        return ObjectId(str(user_id))
    except Exception:
        return None


def suggest_series(
    title: str | None,
    *,
    owner_id=None,
    threshold: float = DEFAULT_THRESHOLD,
) -> Optional[SeriesSuggestion]:
    """Return the best fuzzy match, or ``None`` if nothing clears the cutoff.

    ``owner_id`` restricts the candidate pool to a single user — required
    in the personal-scope v1 of meetings; pass ``None`` to search globally
    (admin / forward-compat).
    """
    if not title or not title.strip():
        return None

    # Lazy import — rapidfuzz is an optional dep at install time and we
    # don't want a missing wheel to break unrelated module loads.
    try:
        from rapidfuzz import fuzz, process
    except Exception:  # pragma: no cover - import-time failure
        return None

    query: dict = {}
    owner_oid = _user_oid(owner_id) if owner_id is not None else None
    if owner_oid is not None:
        query['owner_id'] = owner_oid

    rows = list(
        mongo.db.meeting_series.find(query, {'_id': 1, 'name': 1})
    )
    if not rows:
        return None

    name_to_id: dict[str, str] = {}
    for row in rows:
        name = (row.get('name') or '').strip()
        if not name:
            continue
        # First-write wins on dup names (Mongo's unique index makes this rare).
        # ``_id`` is already a UUID4 string per the meeting_series model.
        name_to_id.setdefault(name, str(row['_id']))
    if not name_to_id:
        return None

    match = process.extractOne(
        title.strip(),
        list(name_to_id.keys()),
        scorer=fuzz.token_sort_ratio,
        score_cutoff=threshold,
    )
    if match is None:
        return None

    matched_name, score, _ = match
    return SeriesSuggestion(
        series_id=name_to_id[matched_name],
        name=matched_name,
        score=float(score),
    )
