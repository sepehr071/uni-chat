"""Versioned health + status endpoints under /api/v1.

* ``GET /api/v1/health`` — pong. No DB, no external deps. Swarm healthcheck +
  Traefik liveness probe target. Always 200 unless the worker is dead.
* ``GET /api/v1/status`` — readiness + dependency report. Pings Mongo +
  OpenRouter. Returns 200 with a structured `dependencies` map regardless of
  upstream state (so Swarm doesn't kill the container during an upstream
  outage); operators read the body to see what's degraded.
"""
from __future__ import annotations

import logging
import os
import time

import requests
from flask import Blueprint, current_app, jsonify

from app.extensions import mongo

logger = logging.getLogger(__name__)

health_v1_bp = Blueprint('health_v1', __name__)

_OPENROUTER_PING_URL = 'https://openrouter.ai/api/v1/models'
_OPENROUTER_TIMEOUT_S = 3


@health_v1_bp.route('/health', methods=['GET'])
def health():
    """Pong. Cheap, no deps. Compose healthcheck hits this."""
    return jsonify({
        'status': 'ok',
        'version': os.environ.get('VERSION_CODE'),
        'commit': os.environ.get('COMMIT_ID'),
    }), 200


@health_v1_bp.route('/status', methods=['GET'])
def status():
    """Deep status — checks Mongo + OpenRouter.

    Always returns HTTP 200 with a structured body. ``status='ok'`` only when
    every dependency is healthy; otherwise ``status='degraded'`` (Swarm keeps
    the container alive — we don't want OpenRouter outages to trigger a
    cascade restart).
    """
    deps: dict[str, dict] = {}
    overall_ok = True

    # MongoDB
    t0 = time.monotonic()
    try:
        mongo.db.command('ping')
        deps['mongo'] = {'ok': True, 'latency_ms': int((time.monotonic() - t0) * 1000)}
    except Exception as exc:
        deps['mongo'] = {'ok': False, 'error': str(exc)[:200]}
        overall_ok = False

    # OpenRouter (3s timeout — short enough that the endpoint stays snappy
    # when upstream is down; long enough for normal-latency hops). Auth header
    # is optional for /models, but we send it when present so quota-restricted
    # accounts still get a real 200 vs a 401-ish path.
    t0 = time.monotonic()
    try:
        api_key = current_app.config.get('OPENROUTER_API_KEY') or os.environ.get('OPENROUTER_API_KEY')
        headers = {'Authorization': f'Bearer {api_key}'} if api_key else {}
        r = requests.get(_OPENROUTER_PING_URL, headers=headers, timeout=_OPENROUTER_TIMEOUT_S)
        deps['openrouter'] = {
            'ok': r.status_code == 200,
            'status_code': r.status_code,
            'latency_ms': int((time.monotonic() - t0) * 1000),
        }
        if r.status_code != 200:
            overall_ok = False
    except Exception as exc:
        deps['openrouter'] = {'ok': False, 'error': f'{type(exc).__name__}: {str(exc)[:200]}'}
        overall_ok = False

    return jsonify({
        'status': 'ok' if overall_ok else 'degraded',
        'version': os.environ.get('VERSION_CODE'),
        'commit': os.environ.get('COMMIT_ID'),
        'dependencies': deps,
    }), 200
