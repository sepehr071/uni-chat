import logging
from datetime import datetime, timedelta

import requests
from flask import current_app

from app.models.openrouter_model import OpenRouterModelDoc

logger = logging.getLogger(__name__)


class ModelRegistryService:
    """Service wrapping the openrouter_models collection.

    Provides a single read/refresh path for model metadata — modalities,
    pricing, supported parameters, endpoints.  Falls back gracefully when the
    collection is empty (cold-start).
    """

    BASE_URL = 'https://openrouter.ai/api/v1'

    # In-process endpoints cache: model_id -> (fetched_at, payload)
    _endpoints_cache: dict = {}
    _ENDPOINTS_TTL = timedelta(hours=1)

    def __init__(self):
        # Resolved lazily so this can be instantiated outside of app context
        # for testing.  Any method that calls _get_headers() must run inside
        # an app context.
        pass

    def _get_headers(self) -> dict:
        """Return OpenRouter auth headers, reusing OpenRouterService pattern."""
        # Lazy import to avoid circular dependency
        from app.services.openrouter_service import OpenRouterService
        return OpenRouterService.get_headers()

    # ------------------------------------------------------------------
    # Registry refresh
    # ------------------------------------------------------------------

    def refresh(self) -> dict:
        """Fetch the full model list from OpenRouter and upsert into Mongo.

        Returns ``{"synced": N, "at": iso_str}`` on success or
        ``{"error": "..."}`` on network/parse failure.
        Never raises.
        """
        try:
            resp = requests.get(
                f'{self.BASE_URL}/models',
                headers=self._get_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get('data', [])
            synced = OpenRouterModelDoc.upsert_many(items)
            at = datetime.utcnow().isoformat()
            logger.info('model_registry refresh: synced=%d at=%s', synced, at)
            return {'synced': synced, 'at': at}
        except Exception as exc:
            logger.warning('model_registry refresh failed: %s', exc)
            return {'error': str(exc)}

    # ------------------------------------------------------------------
    # Single model access
    # ------------------------------------------------------------------

    def get(self, model_id: str) -> dict | None:
        return OpenRouterModelDoc.get_by_id(model_id)

    # ------------------------------------------------------------------
    # Filtered queries
    # ------------------------------------------------------------------

    def find_by_modality(self, input: list | None = None, output: list | None = None) -> list:
        return OpenRouterModelDoc.find_by_modality(
            input_modalities=input,
            output_modalities=output,
        )

    def find_by_capability(self, param: str) -> list:
        return OpenRouterModelDoc.find_by_capability(param)

    # ------------------------------------------------------------------
    # Capability helpers
    # ------------------------------------------------------------------

    def is_image_capable(self, model_id: str) -> bool:
        """True if the model can produce image output."""
        doc = self.get(model_id)
        if not doc:
            return False
        return 'image' in doc.get('architecture', {}).get('output_modalities', [])

    def is_vision_capable(self, model_id: str) -> bool:
        """True if the model can accept image input."""
        doc = self.get(model_id)
        if not doc:
            return False
        return 'image' in doc.get('architecture', {}).get('input_modalities', [])

    # ------------------------------------------------------------------
    # Pricing
    # ------------------------------------------------------------------

    def get_pricing(self, model_id: str) -> dict:
        """Return per-token and per-million-token pricing for a model.

        Returns a dict with keys:
          prompt, completion, cached  (per-token floats)
          prompt_per_million, completion_per_million, cached_per_million
        Falls back to all-zeros if model not found.
        """
        _zero = {
            'prompt': 0.0,
            'completion': 0.0,
            'cached': 0.0,
            'prompt_per_million': 0.0,
            'completion_per_million': 0.0,
            'cached_per_million': 0.0,
        }
        doc = self.get(model_id)
        if not doc:
            return _zero

        pricing = doc.get('pricing', {})
        prompt = float(pricing.get('prompt', 0) or 0)
        completion = float(pricing.get('completion', 0) or 0)
        cached = float(pricing.get('cached', 0) or 0)

        return {
            'prompt': prompt,
            'completion': completion,
            'cached': cached,
            'prompt_per_million': prompt * 1_000_000,
            'completion_per_million': completion * 1_000_000,
            'cached_per_million': cached * 1_000_000,
        }

    # ------------------------------------------------------------------
    # Endpoints (lazy-fetch, 1h TTL)
    # ------------------------------------------------------------------

    def get_endpoints(self, model_id: str) -> dict | None:
        """Lazy-fetch and cache the /models/{id}/endpoints response.

        Returns the parsed JSON payload or None on error.
        """
        cache_entry = ModelRegistryService._endpoints_cache.get(model_id)
        if cache_entry:
            fetched_at, payload = cache_entry
            if datetime.utcnow() - fetched_at < self._ENDPOINTS_TTL:
                return payload

        try:
            resp = requests.get(
                f'{self.BASE_URL}/models/{model_id}/endpoints',
                headers=self._get_headers(),
                timeout=15,
            )
            resp.raise_for_status()
            payload = resp.json()
            ModelRegistryService._endpoints_cache[model_id] = (datetime.utcnow(), payload)
            return payload
        except Exception as exc:
            logger.warning('get_endpoints(%s) failed: %s', model_id, exc)
            return None

    # ------------------------------------------------------------------
    # Staleness
    # ------------------------------------------------------------------

    def is_stale(self) -> bool:
        """True if the registry has never been synced or was last synced >1h ago."""
        last = OpenRouterModelDoc.get_last_sync_at()
        if last is None:
            return True
        return datetime.utcnow() - last > timedelta(hours=1)

    def _lazy_refresh_if_stale(self) -> None:
        """Best-effort refresh when stale.  Swallows all exceptions."""
        try:
            if self.is_stale():
                self.refresh()
        except Exception as exc:
            logger.warning('_lazy_refresh_if_stale failed: %s', exc)
