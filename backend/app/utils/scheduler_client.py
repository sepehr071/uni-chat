"""
Scheduler client — best-effort HTTP notifications to the scheduler service.
All calls swallow connection errors; they must never raise inside a Flask request.
"""

import os
import logging
import requests

logger = logging.getLogger(__name__)

_DEFAULT_BASE = 'http://127.0.0.1:8082'


def _base_url() -> str:
    return os.environ.get('SCHEDULER_BASE_URL', _DEFAULT_BASE).rstrip('/')


def _auth_headers() -> dict:
    """Build shared-secret header for /internal/* (P0.12). Empty when the
    operator hasn't configured a token (parity with the scheduler's fallback
    behaviour in main.py:_internal_auth_middleware)."""
    token = os.environ.get('SCHEDULER_INTERNAL_TOKEN', '')
    return {'X-Internal-Token': token} if token else {}


def notify(routine_id: str, action: str) -> None:
    """
    Notify the scheduler that a routine changed.

    action ∈ {'upsert', 'delete', 'run_now'}

    POSTs to /internal/reload with JSON body.
    Swallows all RequestException — caller must not rely on success.
    """
    url = f'{_base_url()}/internal/reload'
    payload = {'routine_id': str(routine_id), 'action': action}
    try:
        requests.post(url, json=payload, headers=_auth_headers(), timeout=2)
    except requests.exceptions.RequestException as exc:
        logger.warning('scheduler_client.notify failed (action=%s, routine_id=%s): %s', action, routine_id, exc)


def run_now(routine_id: str) -> None:
    """
    Ask the scheduler to fire a routine immediately.

    POSTs to /internal/run-now with JSON body.
    Swallows all RequestException.
    """
    url = f'{_base_url()}/internal/run-now'
    payload = {'routine_id': str(routine_id)}
    try:
        requests.post(url, json=payload, headers=_auth_headers(), timeout=2)
    except requests.exceptions.RequestException as exc:
        logger.warning('scheduler_client.run_now failed (routine_id=%s): %s', routine_id, exc)
