from datetime import datetime
from typing import Optional
from app.extensions import mongo
from bson import ObjectId


class AutomateMessageModel:
    collection = None

    @classmethod
    def _get_collection(cls):
        if cls.collection is None:
            cls.collection = mongo.db.automate_messages
        return cls.collection

    @classmethod
    def create_indexes(cls) -> None:
        """Compound index so cursor-based pagination is fast per task."""
        cls._get_collection().create_index(
            [("task_id", 1), ("cursor_id", 1)],
            unique=True,
            background=True,
        )

    @classmethod
    def create(
        cls,
        task_id: str,
        cursor_id: str,
        role: str,
        type: str,
        summary: Optional[str],
        data: Optional[dict],
        screenshot_url: Optional[str],
    ) -> str:
        doc = {
            "task_id": ObjectId(task_id),
            "cursor_id": cursor_id,
            "role": role,
            "type": type,
            "summary": summary,
            "data": data,
            "screenshot_url": screenshot_url,
            "created_at": datetime.utcnow(),
        }
        result = cls._get_collection().insert_one(doc)
        return str(result.inserted_id)

    @classmethod
    def find_by_task(cls, task_id: str, limit: int = 500) -> list:
        return list(
            cls._get_collection()
            .find({"task_id": ObjectId(task_id)})
            .sort("created_at", 1)
            .limit(limit)
        )

    @classmethod
    def delete_by_task(cls, task_id: str) -> int:
        result = cls._get_collection().delete_many({"task_id": ObjectId(task_id)})
        return result.deleted_count
