import logging

from scheduler.flask_ctx import flask_app

logger = logging.getLogger(__name__)


async def run_refresh():
    """Hourly OpenRouter model registry refresh.

    Registered as 'scheduler.jobs.model_refresh:run_refresh' — the import-
    string form required by MongoDBJobStore (see CLAUDE.md known issue).
    """
    try:
        with flask_app.app_context():
            from app.services.model_registry_service import ModelRegistryService
            result = ModelRegistryService().refresh()
            logger.info('model_registry refresh: %s', result)
    except Exception as exc:
        logger.exception('model_registry refresh failed: %s', exc)
