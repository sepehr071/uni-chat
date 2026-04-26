from datetime import datetime
from typing import Optional
from app.extensions import mongo
from bson import ObjectId


class AutomateTaskModel:
    collection = None

    @classmethod
    def _get_collection(cls):
        if cls.collection is None:
            cls.collection = mongo.db.automate_tasks
        return cls.collection

    @classmethod
    def create(cls, user_id: str, task_text: str, model: str) -> str:
        doc = {
            "user_id": ObjectId(user_id),
            "task_text": task_text,
            "model": model,
            "status": "pending",
            "session_id": None,
            "live_url": None,
            "output": None,
            "message_count": 0,
            "error": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = cls._get_collection().insert_one(doc)
        return str(result.inserted_id)

    @classmethod
    def find_by_id(cls, task_id: str) -> Optional[dict]:
        return cls._get_collection().find_one({"_id": ObjectId(task_id)})

    @classmethod
    def find_by_user(cls, user_id: str, limit: int = 50, skip: int = 0) -> list:
        return list(
            cls._get_collection()
            .find({"user_id": ObjectId(user_id)})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )

    @classmethod
    def count_by_user(cls, user_id: str) -> int:
        return cls._get_collection().count_documents({"user_id": ObjectId(user_id)})

    @classmethod
    def update(cls, task_id: str, updates: dict) -> bool:
        updates["updated_at"] = datetime.utcnow()
        result = cls._get_collection().update_one(
            {"_id": ObjectId(task_id)},
            {"$set": updates},
        )
        return result.modified_count > 0

    @classmethod
    def delete(cls, task_id: str, user_id: str) -> bool:
        # Cascade-delete messages first
        from app.models.automate_message import AutomateMessageModel
        AutomateMessageModel.delete_by_task(task_id)

        result = cls._get_collection().delete_one(
            {"_id": ObjectId(task_id), "user_id": ObjectId(user_id)}
        )
        return result.deleted_count > 0

    @classmethod
    def set_session(cls, task_id: str, session_id: str, live_url: Optional[str]) -> bool:
        return cls.update(task_id, {"session_id": session_id, "live_url": live_url})

    @classmethod
    def set_status(
        cls,
        task_id: str,
        status: str,
        error: Optional[str] = None,
        output: Optional[str] = None,
    ) -> bool:
        updates: dict = {"status": status}
        if error is not None:
            updates["error"] = error
        if output is not None:
            updates["output"] = output
        return cls.update(task_id, updates)

    @classmethod
    def increment_message_count(cls, task_id: str, delta: int = 1) -> bool:
        result = cls._get_collection().update_one(
            {"_id": ObjectId(task_id)},
            {
                "$inc": {"message_count": delta},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )
        return result.modified_count > 0
