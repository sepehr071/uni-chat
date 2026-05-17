"""
MeetingSummaryModel — generated summary artifacts for a meeting.

Collection: meeting_summaries
Multiple summaries per meeting (regenerate appends a new doc).

Document schema:
  _id                  ObjectId
  meeting_id           str          (UUID4 string referencing meetings._id)
  exec_summary         str
  action_items_json    list
  decisions_json       list
  minutes_json         list         (server-built from words, NOT from LLM)
  qa_json              list | None
  open_questions_json  list | None
  email_draft          str | None
  email_subject        str | None
  email_tone           'formal' | 'casual' | None
  model                str          (LLM model id, e.g. google/gemini-3-flash-preview)
  created_at           datetime (UTC, aware)

Indexes:
  - (meeting_id, created_at DESC)  — latest-summary lookup
"""

from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.extensions import mongo


VALID_EMAIL_TONES = {'formal', 'casual'}


class MeetingSummaryModel:
    collection_name = 'meeting_summaries'

    @staticmethod
    def get_collection():
        return mongo.db[MeetingSummaryModel.collection_name]

    @staticmethod
    def create_indexes():
        col = MeetingSummaryModel.get_collection()
        col.create_index([('meeting_id', ASCENDING), ('created_at', DESCENDING)])

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def create(meeting_id: str, data: dict) -> str:
        """Insert a new summary document.

        Required data keys: exec_summary, action_items_json, decisions_json,
                            minutes_json, model.
        Optional: qa_json, open_questions_json, email_draft, email_subject,
                  email_tone.
        Returns the inserted _id as string.
        """
        email_tone = data.get('email_tone')
        if email_tone is not None and email_tone not in VALID_EMAIL_TONES:
            raise ValueError(f"Invalid email_tone: {email_tone}")

        now = datetime.now(timezone.utc)
        doc = {
            'meeting_id': meeting_id,
            'exec_summary': data.get('exec_summary', ''),
            'action_items_json': data.get('action_items_json', []),
            'decisions_json': data.get('decisions_json', []),
            'minutes_json': data.get('minutes_json', []),
            'qa_json': data.get('qa_json'),
            'open_questions_json': data.get('open_questions_json'),
            'email_draft': data.get('email_draft'),
            'email_subject': data.get('email_subject'),
            'email_tone': email_tone,
            'model': data['model'],
            'created_at': now,
        }
        result = MeetingSummaryModel.get_collection().insert_one(doc)
        return str(result.inserted_id)

    @staticmethod
    def find_by_id(summary_id) -> dict | None:
        if not summary_id:
            return None
        try:
            oid = ObjectId(summary_id) if isinstance(summary_id, str) else summary_id
        except Exception:
            return None
        return MeetingSummaryModel.get_collection().find_one({'_id': oid})

    @staticmethod
    def find_latest_for_meeting(meeting_id: str) -> dict | None:
        """Return the most recently created summary for a meeting (or None)."""
        if not meeting_id:
            return None
        return MeetingSummaryModel.get_collection().find_one(
            {'meeting_id': meeting_id},
            sort=[('created_at', DESCENDING)],
        )

    @staticmethod
    def list_for_meeting(meeting_id: str, limit: int = 20) -> list:
        """List summaries for a meeting, newest first."""
        cursor = (
            MeetingSummaryModel.get_collection()
            .find({'meeting_id': meeting_id})
            .sort('created_at', DESCENDING)
            .limit(limit)
        )
        return list(cursor)

    @staticmethod
    def delete(summary_id) -> bool:
        try:
            oid = ObjectId(summary_id) if isinstance(summary_id, str) else summary_id
        except Exception:
            return False
        result = MeetingSummaryModel.get_collection().delete_one({'_id': oid})
        return result.deleted_count > 0

    @staticmethod
    def delete_for_meeting(meeting_id: str) -> int:
        """Cascade delete all summaries for a meeting. Returns deleted count."""
        result = MeetingSummaryModel.get_collection().delete_many({'meeting_id': meeting_id})
        return result.deleted_count
