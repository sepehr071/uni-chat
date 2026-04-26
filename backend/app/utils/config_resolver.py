from app.models.llm_config import LLMConfigModel
from app.prompts.canvas import CANVAS_SYSTEM_PROMPT

QUICK_MODELS = {
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
    'openai/gpt-5.2': 'GPT-5.2',
    'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
}

AGENT_CONFIGS = {
    'canvas': {
        'name': 'Canvas Coder',
        'model_id': 'moonshotai/kimi-k2.6',
        'system_prompt': CANVAS_SYSTEM_PROMPT,
        'parameters': {'temperature': 0.4, 'max_tokens': 8000},
    },
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
    if config_id.startswith('agent:'):
        agent_key = config_id.split(':', 1)[1]
        cfg = AGENT_CONFIGS.get(agent_key)
        if not cfg:
            return None
        return {
            '_id': config_id,
            'name': cfg['name'],
            'model_id': cfg['model_id'],
            'system_prompt': cfg['system_prompt'],
            'parameters': cfg['parameters'],
            'is_agent': True,
        }
    return LLMConfigModel.find_by_id(config_id)
