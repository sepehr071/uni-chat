"""Scheduler service entrypoint.

Run with::

    python -m scheduler.main

Boots an AsyncIOScheduler + an aiohttp server on the same event loop. The
aiohttp server exposes the internal endpoints used by the Flask backend
(`POST /internal/reload`, `POST /internal/run-now`, `GET /internal/health`).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from aiohttp import web
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from scheduler.settings import settings
from scheduler.jobstore import build_jobstore
from scheduler import sync, retry

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(name)s %(levelname)s: %(message)s',
)
log = logging.getLogger('unichat-scheduler')


# ---------------------------------------------------------------------------
# Scheduler factory
# ---------------------------------------------------------------------------

def build_scheduler() -> AsyncIOScheduler:
    job_defaults = {
        'coalesce': True,
        'misfire_grace_time': 300,
        'max_instances': 1,
    }
    scheduler = AsyncIOScheduler(
        jobstores={'default': build_jobstore()},
        job_defaults=job_defaults,
        timezone='UTC',
    )
    retry.install(scheduler)
    return scheduler


# ---------------------------------------------------------------------------
# HTTP handlers
# ---------------------------------------------------------------------------

async def health_handler(request: web.Request) -> web.Response:
    sched = request.app['scheduler']
    return web.json_response({
        'status': 'ok',
        'jobs': len(sched.get_jobs()),
        'time': datetime.now(timezone.utc).isoformat(),
    })


async def reload_handler(request: web.Request) -> web.Response:
    """POST /internal/reload  body={routine_id, action}

    action ∈ {upsert, delete, run_now}
    """
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({'error': 'invalid_json'}, status=400)

    routine_id = (payload or {}).get('routine_id')
    action = (payload or {}).get('action')

    if not routine_id or not action:
        return web.json_response({'error': 'routine_id and action required'}, status=400)

    sched = request.app['scheduler']

    if action == 'delete':
        await sync.delete_job(sched, routine_id)
        return web.json_response({'ok': True, 'action': 'delete'})

    if action == 'upsert':
        ok = await sync.upsert_job(sched, routine_id)
        return web.json_response({'ok': ok, 'action': 'upsert'})

    if action == 'run_now':
        return await _run_now(sched, routine_id)

    return web.json_response({'error': f'unknown action: {action}'}, status=400)


async def run_now_handler(request: web.Request) -> web.Response:
    """POST /internal/run-now  body={routine_id}"""
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({'error': 'invalid_json'}, status=400)

    routine_id = (payload or {}).get('routine_id')
    if not routine_id:
        return web.json_response({'error': 'routine_id required'}, status=400)

    sched = request.app['scheduler']
    return await _run_now(sched, routine_id)


async def _run_now(sched: AsyncIOScheduler, routine_id: str) -> web.Response:
    """Schedule a one-shot job +1s in the future for the given routine id."""
    fire_at = datetime.now(timezone.utc) + timedelta(seconds=1)
    job_id = f'run-now::{routine_id}::{int(fire_at.timestamp())}'
    sched.add_job(
        'scheduler.executor:run_routine',
        trigger=DateTrigger(run_date=fire_at),
        id=job_id,
        replace_existing=False,
        args=[str(routine_id)],
        misfire_grace_time=120,
    )
    return web.json_response({'ok': True, 'fired_job_id': job_id})


# ---------------------------------------------------------------------------
# Periodic tick task
# ---------------------------------------------------------------------------

async def _tick_loop(sched: AsyncIOScheduler):
    """Periodic 30-second reconcile against the routines collection."""
    while True:
        try:
            await sync.tick(sched)
        except Exception as exc:
            log.exception('tick failed: %s', exc)
        await asyncio.sleep(30)


# ---------------------------------------------------------------------------
# aiohttp app lifecycle
# ---------------------------------------------------------------------------

def build_app(scheduler: AsyncIOScheduler) -> web.Application:
    app = web.Application()
    app['scheduler'] = scheduler
    app.router.add_get('/internal/health', health_handler)
    app.router.add_post('/internal/reload', reload_handler)
    app.router.add_post('/internal/run-now', run_now_handler)

    async def _on_startup(_app):
        scheduler.start()
        log.info('AsyncIOScheduler started')
        loaded = await sync.full_reconcile(scheduler)
        log.info('startup reconcile complete (%d routines loaded)', loaded)

        # Register hourly OpenRouter model registry refresh
        scheduler.add_job(
            'scheduler.jobs.model_refresh:run_refresh',
            trigger=CronTrigger.from_crontab('0 * * * *'),
            id='model_refresh_hourly',
            replace_existing=True,
            coalesce=True,
            misfire_grace_time=300,
        )
        log.info('registered model_refresh_hourly job')

        _app['_tick_task'] = asyncio.create_task(_tick_loop(scheduler))

    async def _on_cleanup(_app):
        task = _app.get('_tick_task')
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass

    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)
    return app


def main() -> None:
    sched = build_scheduler()
    app = build_app(sched)
    log.info('Starting scheduler HTTP server on 127.0.0.1:%d', settings.reload_port)
    web.run_app(app, host='127.0.0.1', port=settings.reload_port)


if __name__ == '__main__':
    main()
