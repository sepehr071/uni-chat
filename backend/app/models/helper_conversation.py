"""
HelperConversationModel — persistent rolling history for the in-app Helper guide.

One document per user (unique index on user_id). Messages are appended via
$push to keep writes atomic. Older turns aren't trimmed at write time; the
rolling_window helper slices the tail for prompt builds so callers control
the context size cheaply without rewriting the whole doc.
"""
from datetime import datetime
from typing import Optional

from bson.objectid import ObjectId

from app.extensions import mongo


class HelperConversationModel:
    collection_name = 'helper_conversations'

    @staticmethod
    def get_collection():
        return mongo.db[HelperConversationModel.collection_name]

    @staticmethod
    def create_indexes():
        """Create necessary indexes for the helper_conversations collection."""
        collection = HelperConversationModel.get_collection()
        collection.create_index('user_id', unique=True)

    @staticmethod
    def _coerce_user_id(user_id):
        if isinstance(user_id, str):
            return ObjectId(user_id)
        return user_id

    @staticmethod
    def get_or_create(user_id) -> dict:
        """Find the user's helper conversation, inserting an empty doc if missing."""
        uid = HelperConversationModel._coerce_user_id(user_id)
        coll = HelperConversationModel.get_collection()
        doc = coll.find_one({'user_id': uid})
        if doc:
            return doc

        now = datetime.utcnow()
        new_doc = {
            'user_id': uid,
            'messages': [],
            'created_at': now,
            'updated_at': now,
        }
        result = coll.insert_one(new_doc)
        new_doc['_id'] = result.inserted_id
        return new_doc

    @staticmethod
    def append_message(
        user_id,
        role: str,
        content: str,
        page_context: Optional[dict] = None,
        deep_links: Optional[list] = None,
    ) -> bool:
        """Atomically append a message to the user's helper conversation.

        Upserts the parent doc so callers don't have to call get_or_create
        first. Returns True if a row was matched/inserted.
        """
        uid = HelperConversationModel._coerce_user_id(user_id)
        now = datetime.utcnow()
        entry = {
            'role': role,
            'content': content,
            'page_context': page_context,
            'deep_links': deep_links,
            'created_at': now,
        }
        result = HelperConversationModel.get_collection().update_one(
            {'user_id': uid},
            {
                '$push': {'messages': entry},
                '$set': {'updated_at': now},
                '$setOnInsert': {'created_at': now},
            },
            upsert=True,
        )
        return (result.matched_count + result.upserted_id is not None) > 0

    @staticmethod
    def clear(user_id) -> bool:
        """Delete the user's helper conversation. Next append recreates it."""
        uid = HelperConversationModel._coerce_user_id(user_id)
        result = HelperConversationModel.get_collection().delete_one({'user_id': uid})
        return result.deleted_count > 0

    @staticmethod
    def rolling_window(user_id, n: int = 30) -> list:
        """Return the last `n` messages for prompt building (empty list if no doc)."""
        uid = HelperConversationModel._coerce_user_id(user_id)
        doc = HelperConversationModel.get_collection().find_one({'user_id': uid})
        if not doc:
            return []
        messages = doc.get('messages') or []
        if n <= 0:
            return []
        return messages[-n:]

    @staticmethod
    def get_history(user_id) -> list:
        """Return the full message list for the /history endpoint (empty if no doc)."""
        uid = HelperConversationModel._coerce_user_id(user_id)
        doc = HelperConversationModel.get_collection().find_one({'user_id': uid})
        if not doc:
            return []
        return doc.get('messages') or []
