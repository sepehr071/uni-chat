"""
MeetingTranscriptModel — diarized transcript for a meeting.

Collection: meeting_transcripts
_id: meeting_id (UUID4 string) — 1:1 with meetings, separate collection so a
1-hour meeting's per-word JSON does not blow the 16MB document cap on meetings.

Document schema:
  _id          str   (== meeting_id)
  meeting_id   str   (duplicated for clarity and for ad-hoc indexing if needed)
  raw_json     dict  (full Scribe response)
  plain_text   str   (joined transcript text)
  words_json   list[{text, start, end, type, speaker_id}]
  language_code str  default 'fas'
  created_at   datetime (UTC, aware)
"""

from datetime import datetime, timezone

from app.extensions import mongo


class MeetingTranscriptModel:
    collection_name = 'meeting_transcripts'

    @staticmethod
    def get_collection():
        return mongo.db[MeetingTranscriptModel.collection_name]

    @staticmethod
    def create_indexes():
        # _id is meeting_id (unique by default). No extra indexes needed for v1.
        # Touch the collection to ensure it exists on first boot.
        MeetingTranscriptModel.get_collection()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(meeting_id: str, data: dict) -> str:
        """Insert a transcript document keyed by meeting_id.

        Required data keys: raw_json, plain_text, words_json.
        Optional: language_code.

        If a transcript already exists for this meeting_id, it is REPLACED.
        Returns meeting_id.
        """
        now = datetime.now(timezone.utc)
        doc = {
            '_id': meeting_id,
            'meeting_id': meeting_id,
            'raw_json': data.get('raw_json', {}),
            'plain_text': data.get('plain_text', ''),
            'words_json': data.get('words_json', []),
            'language_code': data.get('language_code', 'fas'),
            'created_at': now,
        }
        MeetingTranscriptModel.get_collection().replace_one(
            {'_id': meeting_id},
            doc,
            upsert=True,
        )
        return meeting_id

    @staticmethod
    def find_by_id(meeting_id: str) -> dict | None:
        if not meeting_id:
            return None
        return MeetingTranscriptModel.get_collection().find_one({'_id': meeting_id})

    @staticmethod
    def find_by_meeting(meeting_id: str) -> dict | None:
        """Alias for find_by_id, given the 1:1 relationship."""
        return MeetingTranscriptModel.find_by_id(meeting_id)

    @staticmethod
    def update(meeting_id: str, data: dict) -> bool:
        """Partial update on a transcript doc."""
        if not data:
            return False
        result = MeetingTranscriptModel.get_collection().update_one(
            {'_id': meeting_id},
            {'$set': data},
        )
        return result.matched_count > 0

    @staticmethod
    def delete(meeting_id: str) -> bool:
        """Delete the transcript for a meeting."""
        result = MeetingTranscriptModel.get_collection().delete_one({'_id': meeting_id})
        return result.deleted_count > 0
