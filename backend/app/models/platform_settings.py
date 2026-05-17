from datetime import datetime
from bson import ObjectId

from app.extensions import mongo


DEFAULT_FEATURES = {
    'arena': False,
    'debate': False,
    'image_studio': True,
    'workflow': False,
    'knowledge': True,
    'automate_agent': False,
    'meetings': False,
    'routines': False,
    'code_canvas_run': True,
    'telegram_bot': False,
}

SINGLETON_ID = 'singleton'


class PlatformSettingsModel:
    collection_name = 'platform_settings'

    @staticmethod
    def get_collection():
        return mongo.db[PlatformSettingsModel.collection_name]

    @staticmethod
    def ensure_singleton():
        """Upsert the singleton doc with defaults if missing.

        `$setOnInsert` on `features` so existing flag values are never
        overwritten on re-boot.
        """
        now = datetime.utcnow()
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {
                '$setOnInsert': {
                    '_id': SINGLETON_ID,
                    'features': dict(DEFAULT_FEATURES),
                    'updated_at': now,
                    'updated_by': None,
                }
            },
            upsert=True,
        )

    @staticmethod
    def get():
        """Return the singleton doc with all default flag keys present.

        If any key from DEFAULT_FEATURES is missing on the stored doc, merge
        it in for the returned value (read-side only — does not write back).
        Always returns a dict with shape:
            {'_id':'singleton', 'features':{...}, 'updated_at':..., 'updated_by':...}
        """
        doc = PlatformSettingsModel.get_collection().find_one({'_id': SINGLETON_ID})
        if not doc:
            return {
                '_id': SINGLETON_ID,
                'features': dict(DEFAULT_FEATURES),
                'updated_at': None,
                'updated_by': None,
                'holding_credits_topups_usd': 0.0,
            }
        features = doc.get('features') or {}
        merged = {**DEFAULT_FEATURES, **features}
        return {
            '_id': doc.get('_id', SINGLETON_ID),
            'features': merged,
            'updated_at': doc.get('updated_at'),
            'updated_by': doc.get('updated_by'),
            'holding_credits_topups_usd': float(doc.get('holding_credits_topups_usd') or 0),
        }

    @staticmethod
    def set_feature(name, enabled, by):
        """Toggle a single feature flag.

        Validates `name in DEFAULT_FEATURES`. Coerces `enabled` to bool.
        `by` is the platform_admin ObjectId (or str).
        """
        if name not in DEFAULT_FEATURES:
            raise ValueError(f"Unknown feature: {name!r}. Must be one of {sorted(DEFAULT_FEATURES.keys())}")
        if not isinstance(enabled, bool):
            raise ValueError(f"`enabled` must be bool, got {type(enabled).__name__}")
        if isinstance(by, str):
            by = ObjectId(by)

        now = datetime.utcnow()
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {
                '$set': {
                    f'features.{name}': enabled,
                    'updated_at': now,
                    'updated_by': by,
                },
                '$setOnInsert': {'_id': SINGLETON_ID},
            },
            upsert=True,
        )
        return PlatformSettingsModel.get()

    @staticmethod
    def add_holding_credits(amount_usd: float, by) -> dict:
        """Increment the holding-level credit pool. ``by`` = platform_admin ObjectId.

        Returns the updated singleton. Caller is responsible for writing a
        ``platform_audit_log`` row (so type / note / IP are captured there).
        """
        if isinstance(by, str):
            by = ObjectId(by)
        now = datetime.utcnow()
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {
                '$inc': {'holding_credits_topups_usd': float(amount_usd or 0)},
                '$set': {'updated_at': now, 'updated_by': by},
                '$setOnInsert': {
                    '_id': SINGLETON_ID,
                    'features': dict(DEFAULT_FEATURES),
                },
            },
            upsert=True,
        )
        doc = PlatformSettingsModel.get_collection().find_one({'_id': SINGLETON_ID}) or {}
        return doc

    @staticmethod
    def bulk_set(features_dict, by):
        """Toggle multiple flags atomically. Rejects unknown keys with ValueError."""
        if not isinstance(features_dict, dict) or not features_dict:
            raise ValueError("features_dict must be a non-empty dict")
        unknown = [k for k in features_dict.keys() if k not in DEFAULT_FEATURES]
        if unknown:
            raise ValueError(f"Unknown feature keys: {unknown}")
        for k, v in features_dict.items():
            if not isinstance(v, bool):
                raise ValueError(f"Feature {k!r} value must be bool, got {type(v).__name__}")

        if isinstance(by, str):
            by = ObjectId(by)

        now = datetime.utcnow()
        set_payload = {f'features.{k}': v for k, v in features_dict.items()}
        set_payload['updated_at'] = now
        set_payload['updated_by'] = by

        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {
                '$set': set_payload,
                '$setOnInsert': {'_id': SINGLETON_ID},
            },
            upsert=True,
        )
        return PlatformSettingsModel.get()
