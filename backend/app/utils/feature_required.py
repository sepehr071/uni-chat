from functools import wraps

from flask import jsonify, g

from app.models.platform_settings import PlatformSettingsModel


def feature_required(name):
    """Gate a route on a platform feature flag.

    Returns 404 `{error:'feature_disabled', feature:<name>}` when the flag is
    off — disabled features look like the route doesn't exist.

    Reads `PlatformSettingsModel.get()` once per request via `flask.g` so a
    chain of `@feature_required(...)` decorators (or multiple checks in one
    handler) does not multiply DB lookups.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            features = getattr(g, 'platform_features', None)
            if features is None:
                features = PlatformSettingsModel.get().get('features', {}) or {}
                g.platform_features = features
            if not features.get(name):
                return jsonify({'error': 'feature_disabled', 'feature': name, 'status': 404}), 404
            return fn(*args, **kwargs)
        return wrapper
    return decorator
