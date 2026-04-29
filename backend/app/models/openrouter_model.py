from datetime import datetime
from pymongo import UpdateOne, ASCENDING, DESCENDING
from app.extensions import mongo


class OpenRouterModelDoc:
    """Mongo model for the openrouter_models collection.

    _id is the OpenRouter model ID string (e.g. 'anthropic/claude-sonnet-4.5').
    The collection mirrors the per-item shape returned by GET /api/v1/models.
    """

    collection_name = 'openrouter_models'

    @staticmethod
    def get_collection():
        return mongo.db[OpenRouterModelDoc.collection_name]

    @staticmethod
    def create_indexes():
        """Create indexes for the openrouter_models collection."""
        col = OpenRouterModelDoc.get_collection()
        # _id is the PK (model id string) — Mongo creates _id index automatically.
        col.create_index('architecture.output_modalities')
        col.create_index('architecture.input_modalities')
        col.create_index('expiration_date')
        col.create_index('last_synced_at')

    @staticmethod
    def _coerce_pricing(pricing: dict) -> dict:
        """OpenRouter returns pricing values as strings — coerce to float."""
        if not pricing:
            return {}
        result = {}
        for key, val in pricing.items():
            try:
                result[key] = float(val)
            except (TypeError, ValueError):
                result[key] = 0.0
        return result

    @staticmethod
    def upsert_many(items: list) -> int:
        """Bulk upsert a list of model dicts from the OpenRouter /models response.

        Returns the count of upserted/modified documents.
        """
        if not items:
            return 0

        now = datetime.utcnow()
        ops = []
        for item in items:
            model_id = item.get('id')
            if not model_id:
                continue

            arch = item.get('architecture', {})
            pricing = OpenRouterModelDoc._coerce_pricing(item.get('pricing', {}))

            doc = {
                'name': item.get('name', model_id),
                'context_length': item.get('context_length'),
                'pricing': pricing,
                'architecture': {
                    'input_modalities': arch.get('input_modalities', arch.get('modality', '').split('+text')[0].split('+') if arch.get('modality') else ['text']),
                    'output_modalities': arch.get('output_modalities', ['text']),
                },
                'supported_parameters': item.get('supported_parameters', []),
                'created': item.get('created'),
                'expiration_date': item.get('expiration_date'),
                'last_synced_at': now,
                'raw': item,
            }

            ops.append(UpdateOne(
                {'_id': model_id},
                {'$set': doc},
                upsert=True,
            ))

        if not ops:
            return 0

        result = OpenRouterModelDoc.get_collection().bulk_write(ops, ordered=False)
        return result.upserted_count + result.modified_count

    @staticmethod
    def find_by_modality(input_modalities=None, output_modalities=None) -> list:
        """Return models matching the given input/output modalities.

        Uses $all so every requested modality must be present.
        """
        query = {}
        if input_modalities:
            query['architecture.input_modalities'] = {'$all': input_modalities}
        if output_modalities:
            query['architecture.output_modalities'] = {'$all': output_modalities}

        return list(OpenRouterModelDoc.get_collection().find(query))

    @staticmethod
    def find_by_capability(supported_parameter: str) -> list:
        """Return models that list supported_parameter in their supported_parameters array."""
        return list(OpenRouterModelDoc.get_collection().find(
            {'supported_parameters': supported_parameter}
        ))

    @staticmethod
    def get_by_id(model_id: str) -> dict | None:
        """Return a single model doc by its id, or None."""
        return OpenRouterModelDoc.get_collection().find_one({'_id': model_id})

    @staticmethod
    def get_last_sync_at() -> datetime | None:
        """Return the latest last_synced_at across the collection, or None if empty."""
        col = OpenRouterModelDoc.get_collection()
        result = list(col.find({}, {'last_synced_at': 1}).sort('last_synced_at', DESCENDING).limit(1))
        if not result:
            return None
        return result[0].get('last_synced_at')

    @staticmethod
    def count() -> int:
        """Total number of model documents in the collection."""
        return OpenRouterModelDoc.get_collection().count_documents({})

    @staticmethod
    def find_all(skip: int = 0, limit: int = 500, sort_by: str = 'created', sort_dir: int = -1) -> list:
        """Paginated list of all models."""
        sort_direction = DESCENDING if sort_dir == -1 else ASCENDING
        return list(
            OpenRouterModelDoc.get_collection()
            .find({})
            .sort(sort_by, sort_direction)
            .skip(skip)
            .limit(limit)
        )
