from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

QUICK_MODELS = [
    ('Gemini 3 Flash',     'quick:google/gemini-3-flash-preview'),
    ('Grok 4.1 Fast',      'quick:x-ai/grok-4.1-fast'),
    ('Gemini 2.5 Lite',    'quick:google/gemini-2.5-flash-lite'),
    ('GPT-5.2',            'quick:openai/gpt-5.2'),
    ('Claude Sonnet 4.5',  'quick:anthropic/claude-sonnet-4.5'),
]


def project_picker(projects: list[dict]) -> InlineKeyboardMarkup:
    """projects: [{_id, name, workspace_name}]. Includes 'Personal (no project)' first."""
    b = InlineKeyboardBuilder()
    b.button(text='-- Personal --', callback_data='proj:none')
    for p in projects[:20]:
        ws = p.get('workspace_name') or ''
        label = f"{p['name']}{f' - {ws}' if ws else ''}"
        b.button(text=label[:64], callback_data=f"proj:{p['_id']}")
    b.adjust(1)
    return b.as_markup()


def model_picker(assistants: list[dict]) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    for label, cfg_id in QUICK_MODELS:
        b.button(text=label, callback_data=f'cfg:{cfg_id}')
    for a in assistants[:10]:
        b.button(text=f'⭐ {a["name"]}', callback_data=f'cfg:{a["_id"]}')
    b.adjust(1)
    return b.as_markup()
