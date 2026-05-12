"""
Centralized quick-models registry — single source of truth.

Used by:
  - app/utils/config_resolver.py     (resolve `quick:<id>` to a config dict)
  - app/routes/debate.py              (enrich session listings + detail)
  - app/routes/model_catalog.py       (public endpoint surfacing quick-models)
  - frontend src/constants/models.js  (frontend fetches via /api/quick-models)

When adding / removing a quick model, edit ONLY this file. Frontend can either
fetch from `/api/quick-models` at boot OR fall back to its static list (kept
in sync manually for offline / cold-cache scenarios).
"""

# Ordered dict — preserves UI sort order.
QUICK_MODELS: dict[str, str] = {
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
    'openai/gpt-5.2': 'GPT-5.2',
    'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
}


def name_for(model_id: str) -> str:
    """Return the display name for a model id, falling back to the id itself."""
    return QUICK_MODELS.get(model_id, model_id)


def is_quick(config_id: str | None) -> bool:
    """True when a config identifier matches the `quick:<model>` prefix."""
    return bool(config_id) and str(config_id).startswith('quick:')


def model_id_from_quick(config_id: str) -> str:
    """Strip the `quick:` prefix; idempotent for already-stripped ids."""
    s = str(config_id)
    return s[len('quick:'):] if s.startswith('quick:') else s
