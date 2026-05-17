"""
MeetingModel — top-level meeting document.

Collection: meetings
_id: UUID4 string (NOT ObjectId — matches upstream schema for cross-system refs).

Document schema:
  _id                 str   (UUID4)
  owner_id            ObjectId
  title               str | None
  status              'uploaded' | 'transcribing' | 'summarizing' | 'done' | 'failed'
  original_filename   str
  audio_path          str
  language            str   default 'fas'
  duration_s          float | None
  num_speakers        int | None
  meeting_brief       str | None
  series_id           str | None    (UUID4 string referencing meeting_series._id)
  error_message       str | None
  speakers            list[{speaker_id: str, display_name: str | None}]
  latest_summary_id   ObjectId | None   (fast-fetch pointer into meeting_summaries)
  created_at          datetime  (UTC, aware)
  updated_at          datetime  (UTC, aware)

Indexes:
  - (owner_id, created_at DESC)
  - (owner_id, series_id)
  - (owner_id, status)
  - text index on title

Status state machine:
  uploaded -> transcribing -> summarizing -> done
                                          \\-> failed
  (failed is terminal; cancellation flips to failed with error_message)
"""

import uuid
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING, TEXT

from app.extensions import mongo


MEETING_STATUS = {
    'UPLOADED': 'uploaded',
    'TRANSCRIBING': 'transcribing',
    'SUMMARIZING': 'summarizing',
    'DONE': 'done',
    'FAILED': 'failed',
}

VALID_MEETING_STATUSES = set(MEETING_STATUS.values())

DEFAULT_LANGUAGE = 'fas'


class MeetingModel:
    collection_name = 'meetings'

    @staticmethod
    def get_collection():
        return mongo.db[MeetingModel.collection_name]

    @staticmethod
    def create_indexes():
        col = MeetingModel.get_collection()
        col.create_index([('owner_id', ASCENDING), ('created_at', DESCENDING)])
        col.create_index([('owner_id', ASCENDING), ('series_id', ASCENDING)])
        col.create_index([('owner_id', ASCENDING), ('status', ASCENDING)])
        col.create_index([('title', TEXT)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(owner_id: str, data: dict) -> str:
        """
        Insert a new meeting document.

        Required data keys: original_filename, audio_path.
        Optional: title, status, language, duration_s, num_speakers, meeting_brief,
                  series_id, speakers, _id (UUID4 string — auto-generated if absent).

        Returns the inserted _id (UUID4 string).
        """
        now = datetime.now(timezone.utc)
        meeting_id = data.get('_id') or str(uuid.uuid4())

        status = data.get('status', MEETING_STATUS['UPLOADED'])
        if status not in VALID_MEETING_STATUSES:
            raise ValueError(f"Invalid meeting status: {status}")

        speakers = data.get('speakers') or []
        # Normalise speakers to ensure shape
        normalised_speakers = [
            {
                'speaker_id': s['speaker_id'],
                'display_name': s.get('display_name'),
            }
            for s in speakers
        ]

        doc = {
            '_id': meeting_id,
            'owner_id': ObjectId(owner_id),
            'title': data.get('title'),
            'status': status,
            'original_filename': data['original_filename'],
            'audio_path': data['audio_path'],
            'language': data.get('language', DEFAULT_LANGUAGE),
            'duration_s': data.get('duration_s'),
            'num_speakers': data.get('num_speakers'),
            'meeting_brief': data.get('meeting_brief'),
            'series_id': data.get('series_id'),
            'error_message': data.get('error_message'),
            'speakers': normalised_speakers,
            'latest_summary_id': data.get('latest_summary_id'),
            'created_at': now,
            'updated_at': now,
        }
        MeetingModel.get_collection().insert_one(doc)
        return meeting_id

    @staticmethod
    def find_by_id(meeting_id: str) -> dict | None:
        if not meeting_id:
            return None
        return MeetingModel.get_collection().find_one({'_id': meeting_id})

    @staticmethod
    def find_owned(meeting_id: str, owner_id: str) -> dict | None:
        """Fetch a meeting only if it belongs to owner_id (returns None otherwise)."""
        if not meeting_id:
            return None
        return MeetingModel.get_collection().find_one(
            {'_id': meeting_id, 'owner_id': ObjectId(owner_id)}
        )

    @staticmethod
    def list_for_user(
        owner_id: str,
        series_id: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list:
        """
        List meetings for an owner, newest first.

        series_id: filter by series (string). Pass None for no filter.
        q: case-insensitive substring search on title.
        """
        query: dict = {'owner_id': ObjectId(owner_id)}
        if series_id:
            query['series_id'] = series_id
        if q:
            # Case-insensitive substring match; cheap regex (callers should keep q short)
            import re
            query['title'] = {'$regex': re.escape(q), '$options': 'i'}
        cursor = (
            MeetingModel.get_collection()
            .find(query)
            .sort('created_at', DESCENDING)
            .skip(skip)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def update(meeting_id: str, owner_id: str, data: dict) -> bool:
        """Update mutable fields. Returns True if a document was matched."""
        if not data:
            return False
        if 'status' in data and data['status'] not in VALID_MEETING_STATUSES:
            raise ValueError(f"Invalid meeting status: {data['status']}")
        data['updated_at'] = datetime.now(timezone.utc)
        result = MeetingModel.get_collection().update_one(
            {'_id': meeting_id, 'owner_id': ObjectId(owner_id)},
            {'$set': data},
        )
        return result.matched_count > 0

    @staticmethod
    def set_status(
        meeting_id: str,
        status: str,
        error_message: str | None = None,
    ) -> bool:
        """Internal-use: update status (and optionally error_message) without owner check.

        Used by background pipeline where the meeting_id has already been authorised.
        """
        if status not in VALID_MEETING_STATUSES:
            raise ValueError(f"Invalid meeting status: {status}")
        update_doc: dict = {
            'status': status,
            'updated_at': datetime.now(timezone.utc),
        }
        if error_message is not None:
            update_doc['error_message'] = error_message
        result = MeetingModel.get_collection().update_one(
            {'_id': meeting_id},
            {'$set': update_doc},
        )
        return result.matched_count > 0

    @staticmethod
    def set_latest_summary(meeting_id: str, summary_id) -> bool:
        """Store the most recent summary _id on the meeting for fast lookups."""
        result = MeetingModel.get_collection().update_one(
            {'_id': meeting_id},
            {'$set': {
                'latest_summary_id': ObjectId(summary_id) if isinstance(summary_id, str) else summary_id,
                'updated_at': datetime.now(timezone.utc),
            }},
        )
        return result.matched_count > 0

    @staticmethod
    def upsert_speakers(meeting_id: str, speakers: list[dict]) -> bool:
        """Replace the embedded speakers array.

        speakers shape: [{'speaker_id': str, 'display_name': str | None}, ...]
        """
        normalised = [
            {
                'speaker_id': s['speaker_id'],
                'display_name': s.get('display_name'),
            }
            for s in speakers
        ]
        result = MeetingModel.get_collection().update_one(
            {'_id': meeting_id},
            {'$set': {
                'speakers': normalised,
                'updated_at': datetime.now(timezone.utc),
            }},
        )
        return result.matched_count > 0

    @staticmethod
    def set_speaker_name(meeting_id: str, speaker_id: str, display_name: str | None) -> bool:
        """Update display_name for one embedded speaker; add if missing."""
        col = MeetingModel.get_collection()
        # Try to update an existing element first
        matched = col.update_one(
            {'_id': meeting_id, 'speakers.speaker_id': speaker_id},
            {'$set': {
                'speakers.$.display_name': display_name,
                'updated_at': datetime.now(timezone.utc),
            }},
        )
        if matched.matched_count > 0:
            return True
        # Speaker not present — push a new entry
        result = col.update_one(
            {'_id': meeting_id},
            {'$push': {'speakers': {'speaker_id': speaker_id, 'display_name': display_name}},
             '$set': {'updated_at': datetime.now(timezone.utc)}},
        )
        return result.matched_count > 0

    @staticmethod
    def delete(meeting_id: str, owner_id: str) -> bool:
        """Delete a meeting. Returns True if deleted. Caller is responsible for
        cascading to transcripts, summaries, and on-disk audio."""
        result = MeetingModel.get_collection().delete_one(
            {'_id': meeting_id, 'owner_id': ObjectId(owner_id)}
        )
        return result.deleted_count > 0
