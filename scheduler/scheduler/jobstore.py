"""APScheduler MongoDBJobStore wiring.

Stored in collection `routines_apscheduler` so it never collides with the
user-facing `routines` collection.
"""
from urllib.parse import urlparse

from apscheduler.jobstores.mongodb import MongoDBJobStore
from pymongo import MongoClient

from scheduler.settings import settings

_DB_NAME = 'unichat'
_JOB_COLLECTION = 'routines_apscheduler'


def _client() -> MongoClient:
    return MongoClient(settings.mongo_uri)


def _database_name(uri: str) -> str:
    """Return the DB name embedded in the URI, or fall back to 'unichat'."""
    try:
        path = urlparse(uri).path or ''
        if path.startswith('/'):
            path = path[1:]
        return path or _DB_NAME
    except Exception:
        return _DB_NAME


def build_jobstore() -> MongoDBJobStore:
    """Construct the MongoDBJobStore APScheduler will use for all jobs."""
    db = _database_name(settings.mongo_uri)
    return MongoDBJobStore(
        database=db,
        collection=_JOB_COLLECTION,
        client=_client(),
    )
