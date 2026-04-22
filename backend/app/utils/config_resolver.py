from app.models.llm_config import LLMConfigModel

QUICK_MODELS = {
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
    'openai/gpt-5.2': 'GPT-5.2',
    'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
}


def resolve_config(config_id: str) -> dict | None:
    """
    Resolve a config ID to a config dict.
    Supports both regular LLM configs and quick models (prefixed with 'quick:').
    """
    config_id = str(config_id)
    if config_id.startswith('quick:'):
        model_id = config_id.replace('quick:', '')
        return {
            '_id': config_id,
            'model_id': model_id,
            'name': QUICK_MODELS.get(model_id, model_id),
            'system_prompt': '',
            'parameters': {'temperature': 0.7, 'max_tokens': 2048},
        }
    return LLMConfigModel.find_by_id(config_id)
