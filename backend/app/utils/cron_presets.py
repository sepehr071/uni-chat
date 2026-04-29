"""
Cron preset definitions and helpers for the Routines feature.
"""

CRON_PRESETS = [
    {'label': 'Every hour', 'cron': '0 * * * *'},
    {'label': 'Daily 9 AM', 'cron': '0 9 * * *'},
    {'label': 'Weekdays 9 AM', 'cron': '0 9 * * 1-5'},
    {'label': 'Every Monday 9 AM', 'cron': '0 9 * * 1'},
    {'label': 'Monthly 1st 9 AM', 'cron': '0 9 1 * *'},
]

_CRON_TO_LABEL = {p['cron']: p['label'] for p in CRON_PRESETS}


def cron_to_label(cron_expr: str) -> str | None:
    """Return the human-readable label for a cron expression, or None if not a preset."""
    return _CRON_TO_LABEL.get(cron_expr)


def validate_cron(cron_expr: str) -> bool:
    """Return True if cron_expr is a valid 5-field cron expression."""
    try:
        from croniter import croniter
        return croniter.is_valid(cron_expr)
    except Exception:
        return False
