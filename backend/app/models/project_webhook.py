"""Project Webhooks model.

A webhook is a single outbound HTTP target that fires on project events.
The ``secret`` is shown to the caller exactly once on creation (and on
``rotate-secret``); list endpoints MUST omit it.
"""

import secrets
from datetime import datetime

from bson import ObjectId

from app.extensions import mongo


class ProjectWebhookModel:
    """Model for project_webhooks collection."""

    collection_name = 'project_webhooks'

    _ALLOWED_UPDATE_FIELDS = {'name', 'url', 'events', 'enabled'}

    @staticmethod
    def get_collection():
        return mongo.db[ProjectWebhookModel.collection_name]

    @staticmethod
    def create_indexes():
        collection = ProjectWebhookModel.get_collection()
        collection.create_index([('project_id', 1), ('created_at', -1)])

    @staticmethod
    def create(project_id, name: str, url: str, events=None, created_by=None) -> dict:
        """Insert a new webhook.

        Generates a fresh ``secret`` via ``secrets.token_urlsafe(32)``.
        ``events`` defaults to ``['*']`` when missing/empty.
        """
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        if created_by is not None and isinstance(created_by, str):
            created_by = ObjectId(created_by)

        if not events:
            events = ['*']
        else:
            events = [str(e).strip() for e in events if str(e).strip()]
            if not events:
                events = ['*']

        now = datetime.utcnow()
        doc = {
            'project_id': project_id,
            'name': name,
            'url': url,
            'events': events,
            'secret': secrets.token_urlsafe(32),
            'enabled': True,
            'last_fired_at': None,
            'last_status': None,
            'created_by': created_by,
            'created_at': now,
            'updated_at': now,
        }
        result = ProjectWebhookModel.get_collection().insert_one(doc)
        doc['_id'] = result.inserted_id
        return doc

    @staticmethod
    def find_by_project(project_id) -> list:
        """List webhooks for a project, newest first."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        cursor = (
            ProjectWebhookModel.get_collection()
            .find({'project_id': project_id})
            .sort('created_at', -1)
        )
        return list(cursor)

    @staticmethod
    def find_by_id(webhook_id) -> dict:
        if isinstance(webhook_id, str):
            webhook_id = ObjectId(webhook_id)
        return ProjectWebhookModel.get_collection().find_one({'_id': webhook_id})

    @staticmethod
    def update(webhook_id, update_data: dict) -> bool:
        """Whitelisted update — name, url, events, enabled."""
        if isinstance(webhook_id, str):
            webhook_id = ObjectId(webhook_id)

        clean = {
            k: v for k, v in (update_data or {}).items()
            if k in ProjectWebhookModel._ALLOWED_UPDATE_FIELDS
        }
        if not clean:
            return False

        if 'events' in clean:
            value = clean['events']
            if not isinstance(value, list):
                raise ValueError('events must be a list of strings')
            cleaned = [str(e).strip() for e in value if str(e).strip()]
            clean['events'] = cleaned or ['*']

        if 'enabled' in clean:
            clean['enabled'] = bool(clean['enabled'])

        clean['updated_at'] = datetime.utcnow()

        result = ProjectWebhookModel.get_collection().update_one(
            {'_id': webhook_id},
            {'$set': clean},
        )
        return result.modified_count > 0

    @staticmethod
    def delete(webhook_id) -> bool:
        if isinstance(webhook_id, str):
            webhook_id = ObjectId(webhook_id)
        result = ProjectWebhookModel.get_collection().delete_one({'_id': webhook_id})
        return result.deleted_count > 0

    @staticmethod
    def rotate_secret(webhook_id) -> str:
        """Generate + persist a new secret for the webhook. Returns the new secret."""
        if isinstance(webhook_id, str):
            webhook_id = ObjectId(webhook_id)

        new_secret = secrets.token_urlsafe(32)
        ProjectWebhookModel.get_collection().update_one(
            {'_id': webhook_id},
            {'$set': {
                'secret': new_secret,
                'updated_at': datetime.utcnow(),
            }},
        )
        return new_secret
