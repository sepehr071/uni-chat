"""
Meeting-series models — recurring meeting groups + glossary + speaker memory.

Three collections defined here:
  - meeting_series            (top-level series doc)
  - meeting_series_keyterms   (per-series glossary terms)
  - meeting_series_speaker_names  (per-series speaker display-name memory)

All three are owner-scoped and use UUID4 string _id values to match upstream
schema (foreign keys across these collections are UUID strings, not ObjectIds).
"""

import uuid
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo


VALID_EMAIL_TONES = {'formal', 'casual'}
VALID_KEYTERM_SOURCES = {'manual', 'suggested', 'accepted'}


# ======================================================================
# MeetingSeriesModel
# ======================================================================
class MeetingSeriesModel:
    """
    Collection: meeting_series
    Unique compound (owner_id, name).

    Document schema:
      _id          str   (UUID4)
      owner_id     ObjectId
      name         str
      email_tone   'formal' | 'casual'   default 'formal'
      created_at   datetime (UTC, aware)
      updated_at   datetime (UTC, aware)

    Indexes:
      - unique (owner_id, name)
      - (owner_id, updated_at DESC) for listing
    """

    collection_name = 'meeting_series'

    @staticmethod
    def get_collection():
        return mongo.db[MeetingSeriesModel.collection_name]

    @staticmethod
    def create_indexes():
        col = MeetingSeriesModel.get_collection()
        col.create_index(
            [('owner_id', ASCENDING), ('name', ASCENDING)],
            unique=True,
            name='uq_series_owner_name',
        )
        col.create_index([('owner_id', ASCENDING), ('updated_at', DESCENDING)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(owner_id: str, data: dict) -> str:
        """Insert a new series document.

        Required data keys: name.
        Optional: email_tone (default 'formal'), _id.
        Returns the inserted _id (UUID4 string).
        """
        email_tone = data.get('email_tone', 'formal')
        if email_tone not in VALID_EMAIL_TONES:
            raise ValueError(f"Invalid email_tone: {email_tone}")

        now = datetime.now(timezone.utc)
        series_id = data.get('_id') or str(uuid.uuid4())
        doc = {
            '_id': series_id,
            'owner_id': ObjectId(owner_id),
            'name': data['name'],
            'email_tone': email_tone,
            'created_at': now,
            'updated_at': now,
        }
        MeetingSeriesModel.get_collection().insert_one(doc)
        return series_id

    @staticmethod
    def find_by_id(series_id: str) -> dict | None:
        if not series_id:
            return None
        return MeetingSeriesModel.get_collection().find_one({'_id': series_id})

    @staticmethod
    def find_owned(series_id: str, owner_id: str) -> dict | None:
        if not series_id:
            return None
        return MeetingSeriesModel.get_collection().find_one(
            {'_id': series_id, 'owner_id': ObjectId(owner_id)}
        )

    @staticmethod
    def find_by_owner_and_name(owner_id: str, name: str) -> dict | None:
        return MeetingSeriesModel.get_collection().find_one(
            {'owner_id': ObjectId(owner_id), 'name': name}
        )

    @staticmethod
    def list_for_user(owner_id: str, skip: int = 0, limit: int = 200) -> list:
        cursor = (
            MeetingSeriesModel.get_collection()
            .find({'owner_id': ObjectId(owner_id)})
            .sort('updated_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def update(series_id: str, owner_id: str, data: dict) -> bool:
        if not data:
            return False
        if 'email_tone' in data and data['email_tone'] not in VALID_EMAIL_TONES:
            raise ValueError(f"Invalid email_tone: {data['email_tone']}")
        data['updated_at'] = datetime.now(timezone.utc)
        result = MeetingSeriesModel.get_collection().update_one(
            {'_id': series_id, 'owner_id': ObjectId(owner_id)},
            {'$set': data},
        )
        return result.matched_count > 0

    @staticmethod
    def delete(series_id: str, owner_id: str) -> bool:
        """Delete a series. Caller is responsible for cascading to keyterms,
        speaker-names, and meetings.series_id unset."""
        result = MeetingSeriesModel.get_collection().delete_one(
            {'_id': series_id, 'owner_id': ObjectId(owner_id)}
        )
        return result.deleted_count > 0


# ======================================================================
# KeytermModel — meeting_series_keyterms
# ======================================================================
class KeytermModel:
    """
    Collection: meeting_series_keyterms
    Unique compound (series_id, term).

    Document schema:
      _id         str   (UUID4)
      series_id   str   (UUID4 — references meeting_series._id)
      term        str
      source      'manual' | 'suggested' | 'accepted'
      created_at  datetime (UTC, aware)

    Indexes:
      - unique (series_id, term)
      - (series_id, source)
    """

    collection_name = 'meeting_series_keyterms'

    @staticmethod
    def get_collection():
        return mongo.db[KeytermModel.collection_name]

    @staticmethod
    def create_indexes():
        col = KeytermModel.get_collection()
        col.create_index(
            [('series_id', ASCENDING), ('term', ASCENDING)],
            unique=True,
            name='uq_series_keyterm',
        )
        col.create_index([('series_id', ASCENDING), ('source', ASCENDING)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(series_id: str, data: dict) -> str:
        """Insert a new keyterm.

        Required: term.
        Optional: source (default 'manual'), _id.
        Raises DuplicateKeyError on (series_id, term) collision — caller may
        prefer upsert_term() to dedupe.
        """
        source = data.get('source', 'manual')
        if source not in VALID_KEYTERM_SOURCES:
            raise ValueError(f"Invalid keyterm source: {source}")

        term_id = data.get('_id') or str(uuid.uuid4())
        doc = {
            '_id': term_id,
            'series_id': series_id,
            'term': data['term'],
            'source': source,
            'created_at': datetime.now(timezone.utc),
        }
        KeytermModel.get_collection().insert_one(doc)
        return term_id

    @staticmethod
    def upsert_term(series_id: str, term: str, source: str = 'manual') -> dict:
        """
        Upsert a term. If a row with (series_id, term) already exists with
        source='suggested' and incoming source='manual', promotes it to 'manual'.
        Returns the resulting document.
        """
        if source not in VALID_KEYTERM_SOURCES:
            raise ValueError(f"Invalid keyterm source: {source}")

        col = KeytermModel.get_collection()
        existing = col.find_one({'series_id': series_id, 'term': term})
        if existing:
            # Promote suggested -> manual when caller explicitly asks for manual
            if source == 'manual' and existing.get('source') == 'suggested':
                col.update_one(
                    {'_id': existing['_id']},
                    {'$set': {'source': 'manual'}},
                )
                existing['source'] = 'manual'
            return existing

        term_id = str(uuid.uuid4())
        doc = {
            '_id': term_id,
            'series_id': series_id,
            'term': term,
            'source': source,
            'created_at': datetime.now(timezone.utc),
        }
        col.insert_one(doc)
        return doc

    @staticmethod
    def find_by_id(term_id: str) -> dict | None:
        if not term_id:
            return None
        return KeytermModel.get_collection().find_one({'_id': term_id})

    @staticmethod
    def list_for_series(series_id: str, source: str | None = None) -> list:
        """List keyterms for a series, optionally filtered by source."""
        query: dict = {'series_id': series_id}
        if source is not None:
            if source not in VALID_KEYTERM_SOURCES:
                raise ValueError(f"Invalid keyterm source filter: {source}")
            query['source'] = source
        cursor = (
            KeytermModel.get_collection()
            .find(query)
            .sort('created_at', ASCENDING)
        )
        return list(cursor)

    @staticmethod
    def set_source(term_id: str, source: str) -> bool:
        """Promote/demote a term's source (e.g. SUGGESTED -> ACCEPTED)."""
        if source not in VALID_KEYTERM_SOURCES:
            raise ValueError(f"Invalid keyterm source: {source}")
        result = KeytermModel.get_collection().update_one(
            {'_id': term_id},
            {'$set': {'source': source}},
        )
        return result.matched_count > 0

    @staticmethod
    def delete(term_id: str) -> bool:
        result = KeytermModel.get_collection().delete_one({'_id': term_id})
        return result.deleted_count > 0

    @staticmethod
    def delete_for_series(series_id: str) -> int:
        """Cascade-delete all keyterms for a series. Returns deleted count."""
        result = KeytermModel.get_collection().delete_many({'series_id': series_id})
        return result.deleted_count


# ======================================================================
# SpeakerNameModel — meeting_series_speaker_names
# ======================================================================
class SpeakerNameModel:
    """
    Collection: meeting_series_speaker_names
    Unique compound (series_id, display_name).

    Document schema:
      _id            str   (UUID4)
      series_id      str   (UUID4)
      display_name   str
      last_used_at   datetime (UTC, aware)
      created_at     datetime (UTC, aware)

    Indexes:
      - unique (series_id, display_name)
      - (series_id, last_used_at DESC) for ordering
    """

    collection_name = 'meeting_series_speaker_names'

    @staticmethod
    def get_collection():
        return mongo.db[SpeakerNameModel.collection_name]

    @staticmethod
    def create_indexes():
        col = SpeakerNameModel.get_collection()
        col.create_index(
            [('series_id', ASCENDING), ('display_name', ASCENDING)],
            unique=True,
            name='uq_series_speaker_name',
        )
        col.create_index([('series_id', ASCENDING), ('last_used_at', DESCENDING)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def upsert(series_id: str, display_name: str) -> dict:
        """
        Upsert a speaker name for a series. Bumps last_used_at on every call.
        Returns the resulting document.
        """
        col = SpeakerNameModel.get_collection()
        now = datetime.now(timezone.utc)
        col.update_one(
            {'series_id': series_id, 'display_name': display_name},
            {
                '$setOnInsert': {
                    '_id': str(uuid.uuid4()),
                    'series_id': series_id,
                    'display_name': display_name,
                    'created_at': now,
                },
                '$set': {'last_used_at': now},
            },
            upsert=True,
        )
        return col.find_one({'series_id': series_id, 'display_name': display_name})

    @staticmethod
    def list_for_series(series_id: str, limit: int = 100) -> list:
        """List speaker names for a series ordered by last_used_at desc."""
        cursor = (
            SpeakerNameModel.get_collection()
            .find({'series_id': series_id})
            .sort('last_used_at', DESCENDING)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def delete(name_id: str) -> bool:
        result = SpeakerNameModel.get_collection().delete_one({'_id': name_id})
        return result.deleted_count > 0

    @staticmethod
    def delete_for_series(series_id: str) -> int:
        """Cascade-delete all speaker names for a series. Returns deleted count."""
        result = SpeakerNameModel.get_collection().delete_many({'series_id': series_id})
        return result.deleted_count
