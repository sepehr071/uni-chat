"""
Debate Message Model

Stores individual messages from debaters and the judge
within a debate session.
"""

from datetime import datetime
from bson import ObjectId
from app.extensions import mongo


class DebateMessageModel:
    """Model for debate messages"""

    collection = 'debate_messages'

    @staticmethod
    def get_collection():
        return mongo.db.debate_messages

    @staticmethod
    def create(session_id: str, round_num: int, config_id: str, role: str,
               content: str, order_in_round: int, metadata: dict = None) -> dict:
        """
        Create a debate message.

        Args:
            session_id: The debate session ID
            round_num: The round number (1-indexed, 0 for judge verdict)
            config_id: The config ID of the speaker
            role: 'debater' or 'judge'
            content: Message content
            order_in_round: Order within the round (for debater turn order)
            metadata: Optional metadata (model_id, tokens, generation_time_ms)

        Returns:
            The created message document
        """
        # Handle quick model IDs (store as string, not ObjectId)
        config_id_value = None
        if config_id:
            config_id_value = config_id if str(config_id).startswith('quick:') else ObjectId(config_id)

        doc = {
            'session_id': ObjectId(session_id),
            'round': round_num,
            'config_id': config_id_value,
            'role': role,
            'content': content,
            'order_in_round': order_in_round,
            'metadata': metadata or {},
            'created_at': datetime.utcnow()
        }
        result = DebateMessageModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_session(session_id: str) -> list:
        """
        Get all messages for a session, ordered by round and order_in_round.

        Args:
            session_id: The debate session ID

        Returns:
            List of message documents ordered correctly
        """
        return list(DebateMessageModel.get_collection().find(
            {'session_id': ObjectId(session_id)}
        ).sort([('round', 1), ('order_in_round', 1)]))

    @staticmethod
    def find_by_session_and_round(session_id: str, round_num: int) -> list:
        """
        Get messages for a specific round.

        Args:
            session_id: The debate session ID
            round_num: The round number

        Returns:
            List of message documents for that round
        """
        return list(DebateMessageModel.get_collection().find({
            'session_id': ObjectId(session_id),
            'round': round_num
        }).sort('order_in_round', 1))

    @staticmethod
    def update_content(message_id: str, content: str, metadata: dict = None) -> bool:
        """
        Update message content and metadata.

        Args:
            message_id: The message ID
            content: New content
            metadata: Optional metadata to set

        Returns:
            True if updated
        """
        updates = {'content': content}
        if metadata:
            updates['metadata'] = metadata

        result = DebateMessageModel.get_collection().update_one(
            {'_id': ObjectId(message_id)},
            {'$set': updates}
        )
        return result.modified_count > 0

    @staticmethod
    def delete_by_session(session_id: str) -> int:
        """
        Delete all messages for a session.

        Args:
            session_id: The debate session ID

        Returns:
            Number of deleted messages
        """
        result = DebateMessageModel.get_collection().delete_many(
            {'session_id': ObjectId(session_id)}
        )
        return result.deleted_count
