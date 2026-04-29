# unichat-scheduler

Standalone asyncio process that fires uni-chat **Routines** (scheduled LLM tasks) on
cron / one-shot triggers using APScheduler. Reuses the backend Flask app for DB
models and OpenRouter wiring (via `pip install -e ../backend`).

## Run

```bash
cd scheduler
uv venv .venv-uv --python 3.12
uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt
uv pip install "setuptools<81"

# put credentials into scheduler/.env (see .env.example)
./.venv-uv/Scripts/python.exe -m scheduler.main
```

By default the service listens on `127.0.0.1:8082` for two internal endpoints
called by the backend's `app.utils.scheduler_client`:

| Method | Path | JSON body | Purpose |
|--------|------|-----------|---------|
| POST | `/internal/reload` | `{routine_id, action}` where `action ∈ {upsert, delete, run_now}` | Re-load or remove a single routine in APScheduler. |
| POST | `/internal/run-now` | `{routine_id}` | Fire a routine immediately (one-shot). |
| GET  | `/internal/health` | — | Liveness probe. |

The service also runs a periodic 30s `tick()` reconcile against the `routines`
collection so that any missed reload event self-heals.

## Env

```
MONGO_URI=mongodb://localhost:27017/unichat
OPENROUTER_API_KEY=<same as backend>
TELEGRAM_BOT_TOKEN=<same token used by bot/>
RELOAD_PORT=8082
```

## Tests

```bash
cd scheduler && ./.venv-uv/Scripts/python.exe -m pytest tests/ -v
```

## Notes

* Separate process by design — eventlet (in Flask backend) collides with asyncio
  if loaded into the same interpreter.
* `bot/.env` ordering trick is replicated here: `scheduler/scheduler/__init__.py`
  loads dotenv **before** any `app.*` import, otherwise backend's `Config` class
  locks in an empty `OPENROUTER_API_KEY`.
* APScheduler stores its job table in a separate Mongo collection
  (`routines_apscheduler`) so the user-facing `routines` collection stays clean.
