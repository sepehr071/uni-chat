"""
Debate Session Model

Stores debate sessions where multiple AI configs discuss a topic
with a judge that synthesizes the final verdict.
"""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class DebateSessionModel:
    """Model for multi-config debate sessions"""

    collection = 'debate_sessions'

    @staticmethod
    def get_collection():
        return mongo.db.debate_sessions

    @staticmethod
    def create(user_id: str, topic: str, config_ids: list, judge_config_id: str,
               rounds: int = 3, max_tokens: int = 2048,
               thinking_type: str = 'balanced', response_length: str = 'balanced') -> dict:
        """
        Create a new debate session.

        Args:
            user_id: The user who created the session
            topic: The debate topic
            config_ids: List of 2-5 debater config IDs
            judge_config_id: Config ID for the judge
            rounds: Number of debate rounds (default 3)
            max_tokens: Max tokens per response (default 2048)
            thinking_type: 'logical', 'feeling', or 'balanced' (default 'balanced')
            response_length: 'short', 'balanced', or 'long' (default 'balanced')

        Returns:
            The created session document
        """
        doc = {
            'user_id': ObjectId(user_id),
            'topic': topic,
            'config_ids': [ObjectId(cid) if not str(cid).startswith('quick:') else cid for cid in config_ids],
            'judge_config_id': ObjectId(judge_config_id) if not str(judge_config_id).startswith('quick:') else judge_config_id,
            'settings': {
                'rounds': rounds,
                'max_tokens': max_tokens,
                'thinking_type': thinking_type,
                'response_length': response_length
            },
            'status': 'pending',
            'current_round': 0,
            'final_verdict': None,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        result = DebateSessionModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_user(user_id: str, page: int = 1, limit: int = 20) -> list:
        """
        List user's debate sessions with pagination.

        Args:
            user_id: The user ID
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            List of session documents
        """
        skip = (page - 1) * limit
        return list(DebateSessionModel.get_collection().find(
            {'user_id': ObjectId(user_id)}
        ).sort('updated_at', -1).skip(skip).limit(limit))

    @staticmethod
    def count_by_user(user_id: str) -> int:
        """Count total sessions for a user"""
        return DebateSessionModel.get_collection().count_documents(
            {'user_id': ObjectId(user_id)}
        )

    @staticmethod
    def find_by_id(session_id: str) -> dict:
        """
        Get a session by ID.

        Args:
            session_id: The session ID

        Returns:
            Session document or None
        """
        return DebateSessionModel.get_collection().find_one(
            {'_id': ObjectId(session_id)}
        )

    @staticmethod
    def update_status(session_id: str, status: str, current_round: int = None) -> bool:
        """
        Update session status and optionally the current round.

        Args:
            session_id: The session ID
            status: New status ('pending', 'in_progress', 'completed', 'cancelled')
            current_round: Optional round number to set

        Returns:
            True if updated
        """
        updates = {
            'status': status,
            'updated_at': datetime.utcnow()
        }
        if current_round is not None:
            updates['current_round'] = current_round

        result = DebateSessionModel.get_collection().update_one(
            {'_id': ObjectId(session_id)},
            {'$set': updates}
        )
        return result.modified_count > 0

    @staticmethod
    def set_verdict(session_id: str, verdict: str) -> bool:
        """
        Save the final judge verdict.

        Args:
            session_id: The session ID
            verdict: The judge's verdict text

        Returns:
            True if updated
        """
        result = DebateSessionModel.get_collection().update_one(
            {'_id': ObjectId(session_id)},
            {'$set': {
                'final_verdict': verdict,
                'status': 'completed',
                'updated_at': datetime.utcnow()
            }}
        )
        return result.modified_count > 0

    @staticmethod
    def delete(session_id: str, user_id: str) -> bool:
        """
        Delete a session (verify ownership).

        Args:
            session_id: The session ID
            user_id: The user ID (for ownership verification)

        Returns:
            True if deleted
        """
        result = DebateSessionModel.get_collection().delete_one({
            '_id': ObjectId(session_id),
            'user_id': ObjectId(user_id)
        })
        return result.deleted_count > 0
