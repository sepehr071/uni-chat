"""Re-export shared telegram format helpers from `app.utils.telegram_format`.

Kept as a thin shim so existing `from bot.services.format import md_to_tg_html`
imports keep working. New code should import from `app.utils.telegram_format`.
"""
from app.utils.telegram_format import md_to_tg_html, _sanitize  # noqa: F401
