# CLAUDE.md

Full-stack AI chat app: Flask backend + React frontend, OpenRouter for multi-model access. Real-time streaming chat, image gen, workflow editor, arena, debate, knowledge vault, Telegram bot gateway.

## Run (4 terminals)

```bash
# Backend (port 5000)
cd backend && ./.venv-uv/Scripts/python.exe run.py

# Frontend (port 3000)
cd frontend && npm run dev

# Telegram bot (polling, dev)
cd bot && ./.venv-uv/Scripts/python.exe -m bot.main

# Routines scheduler (port 8082, internal reload endpoint)
cd scheduler && ./.venv-uv/Scripts/python.exe -m scheduler.main
```

Requires local MongoDB on `:27017`. Bot loads `bot/.env`; backend loads `backend/.env`; scheduler loads `scheduler/.env`.

## Quick Reference

| Task | Command |
|------|---------|
| Backend env (one-time) | `cd backend && uv venv .venv-uv --python 3.12 && uv pip install -r requirements.txt` (env-var: `VIRTUAL_ENV=$PWD/.venv-uv`) |
| Backend server | `cd backend && ./.venv-uv/Scripts/python.exe run.py` (port 5000) |
| Frontend server | `cd frontend && npm run dev` (port 3000, falls back to 3001+ if busy) |
| Build frontend | `cd frontend && npm run build` |
| Run tests | `cd backend && ./.venv-uv/Scripts/python.exe -m pytest` |
| Seed templates | `cd backend && ./.venv-uv/Scripts/python.exe scripts/seed.py [--workflows]` |
| Bot env (one-time) | `cd bot && uv venv .venv-uv --python 3.12 && uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt` |
| Bot (polling, dev) | `cd bot && POLLING=1 ./.venv-uv/Scripts/python.exe -m bot.main` |
| Bot tests | `cd bot && ./.venv-uv/Scripts/python.exe -m pytest tests/` |
| Scheduler env (one-time) | `cd scheduler && uv venv .venv-uv --python 3.12 && uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt && uv pip install "setuptools<81"` |
| Scheduler service | `cd scheduler && ./.venv-uv/Scripts/python.exe -m scheduler.main` (port 8082) |
| Scheduler tests | `cd scheduler && ./.venv-uv/Scripts/python.exe -m pytest tests/` |

---

## Architecture

### Backend (`backend/app/`)
```
├── models/      # MongoDB models
├── routes/      # API blueprints (auth, chat, configs, arena, workflow, canvas, knowledge, debate, automate_agent, ...)
├── services/    # openrouter_service.py, browser_use_service.py, debate_service.py
├── sockets/     # chat_events, arena_events
└── utils/       # decorators, helpers, error handlers, config_resolver
```

### Frontend (`frontend/src/`)
```
├── constants/   # models.js (quick models)
├── context/     # AuthContext (JWT), SocketContext (WebSocket)
├── services/    # API clients (chat, arena, image, workflow, canvas, debate, knowledge, knowledgeFolder, aiPreferences)
├── pages/       # auth, dashboard, chat, arena, debate, workflow, canvas, knowledge, automate-agent, landing, admin
└── components/  # chat/, layout/, config/, arena/, workflow/, common/, ui/ (shadcn), landing/
```

Path alias: `@/` → `frontend/src/`.

### Bot (`bot/`)
```
bot/
├── pyproject.toml         # aiogram, aiohttp, pymongo, pydantic-settings, markdown-it-py
├── .env                   # gitignored — TELEGRAM_BOT_TOKEN + MONGO_URI + OPENROUTER_API_KEY
└── bot/
    ├── main.py            # aiogram entry point (polling | webhook switch via POLLING env)
    ├── settings.py        # pydantic-settings env loader
    ├── flask_ctx.py       # imports `app` from backend/, exposes flask_app for app_context()
    ├── handlers/          # start.py, commands.py, chat.py — aiogram routers
    ├── services/          # auth.py, format.py, ratelimit.py, stream.py, chat.py
    └── keyboards.py       # inline keyboard builders
```
Separate uv venv at `bot/.venv-uv`. Reuses backend `app` package via `pip install -e ../backend` (made possible by `backend/pyproject.toml`).

---

## Features

Each entry: route — file path(s) — distinguishing notes.

### Chat & Arena
- Socket.IO streaming: `send_message` → `message_chunk` → `message_complete`. Arena compares 2–4 configs in parallel via eventlet greenlets.
- **Model picker**: Primary chip in `ChatHeader` (opens below), compact secondary chip in `ChatInput` (opens above). Shared `ModelChip.jsx` + `ConfigSelector.jsx` (Radix Popover + cmdk Command). Fuzzy search across Quick Models + Assistants.
- **Branching**: branch in current convo OR start new convo from branch point (modal in `useChatBranches`).
- **Auto-title**: `google/gemini-2.5-flash-lite` generates 3–5 word titles in user's language.
- Vision via multimodal models. Hooks: `useChatMessages`, `useChatStream`, `useChatBranches`, `useChatExport`.

### Image Generation (`/image-studio`, `/image-history`)
Live OpenRouter image-gen models: `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `openai/gpt-5.4-image-2`. Text-to-image and image-to-image. `/image-history` is dedicated grid view.

### Workflow Editor (`/workflow`)
React Flow canvas. Node types: `imageUpload`, `imageGen`, `textInput`, `aiAgent`, `ttsNode`, `videoGenNode`. Topological execution, save/load, history, duplicate, JSON export/import. 15 templates via `python scripts/seed.py --workflows`.

- **AI Agent**: `aiAgent` node has single "Text input" handle accepting unlimited connections (backend concatenates). Models: Gemini 3 Flash, Gemini 2.5 Lite, Grok 4.1 Fast, GPT-5.2.
- **Ad-Generation**: `ttsNode` (`openai/gpt-4o-mini-tts`) + `videoGenNode` (Veo 3.1 img2vid w/ native audio) drive the "30-Second Product Ad" template.
- **Auto-save**: 5s debounced silent save once first save done. Dirty detection via stripped JSON snapshot — clicks/drags don't mark dirty. Toast suppressed (`saveWorkflow({ silent: true })`).
- **Generate with AI**: Sparkles button → cmdk prompt → `/api/workflow-ai/generate`.
- **Run History panel** (`RunHistoryPanel.jsx`): two-column run list + per-node results (text/image/audio/video/error), filter by status, search by node label.
- **Node Inspector**: Configure / Output / History tabs. Mobile <640px = full-screen modal. `NodeConfigForm` wrapper standardizes layout across 6 inspectors.

Files:
- `pages/workflow/WorkflowPage.jsx`
- `pages/workflow/components/` — Breadcrumb, NodeRail, NodeInspector, CanvasCommandBar, CanvasZoomBar, RunHistoryPanel, LoadWorkflowModal, EmptyCanvasState
- `pages/workflow/components/inspectors/` — 6 per-type inspectors + `NodeConfigForm.jsx`
- `pages/workflow/hooks/useWorkflowState.js` — state, save/auto-save, run history, dirty tracking
- `components/workflow/CompactNodeShell.jsx` — shared 180px shell, renders `data.lastRunAt` via `date-fns formatDistanceToNow`

### Automate Agent (`/automate-agent`)
NL browser automation via [browser-use Cloud](https://docs.browser-use.com). Cloud spawns headless browser, streams events. Embedded `live_url` iframe for live preview. Models: `claude-sonnet-4.6` (default), `claude-opus-4.6`, `gpt-5.4-mini`. Auth: `X-Browser-Use-API-Key` header (NOT Bearer); env `BROWSER_USE_API_KEY`. Frontend warns if `message_count > 50` per task.

Backend: `services/browser_use_service.py` (REST, `requests`-based), `models/automate_task.py`, `automate_message.py`, `routes/automate_agent.py` (CRUD), `routes/automate_agent_stream.py` (SSE; cursor-polls cloud at 2s, 15s keepalive, 30min cap).
Frontend: `pages/automate-agent/AutomateAgentPage.jsx`, `TaskInput.jsx`, `LiveBrowserFrame.jsx`, `EventStream.jsx`, `TaskHistorySidebar.jsx`, `hooks/useAutomateAgentState.js`.

### Debate Mode (`/debate`)
2–5 LLMs discuss a topic in rounds (0 = infinite, capped 20). Shared context across debaters. Judge LLM synthesizes verdict. SSE streaming, full markdown rendering.

- **Settings**: Thinking type (Logical/Balanced/Feeling), Response length (Short/Balanced/Long) — injected into debater prompts.
- **Infinite mode**: Debaters emit `[DEBATE_CONCLUDED]` marker (stripped from display); debate ends when ALL debaters conclude in same round. "Concluded" badge shown.
- Auto-scroll toggle button.

Backend: `debate_session.py`, `debate_message.py`, `debate_service.py`. Frontend: `DebatePage.jsx`, `DebateSetup.jsx`, `DebateArena.jsx`, `DebaterResponse.jsx`, `JudgeVerdict.jsx`.

### Quick Models (Chat & Debate)
5 default models, no custom assistant required:
- `google/gemini-3-flash-preview` — Gemini 3 Flash
- `x-ai/grok-4.1-fast` — Grok 4.1 Fast
- `google/gemini-2.5-flash-lite` — Gemini 2.5 Lite
- `openai/gpt-5.2` — GPT-5.2
- `anthropic/claude-sonnet-4.5` — Claude Sonnet 4.5

Config IDs prefixed `quick:` (e.g. `quick:openai/gpt-5.2`). Defs in `frontend/src/constants/models.js`. Backend resolves via `utils/config_resolver.py`.

### Knowledge Vault (`/knowledge`)
Bookmark valuable AI responses from chat/arena/debate. Folders w/ custom colors, tags, full-text search, favorites, detail modal w/ markdown + copy + edit. Save button = bookmark icon in chat actions.

Backend: `knowledge_item.py`, `knowledge_folder.py`, `/api/knowledge`, `/api/knowledge-folders`. Frontend: `KnowledgePage.jsx`, `KnowledgeCard.jsx`, `KnowledgeDetailModal.jsx`, `KnowledgeFolderSidebar.jsx`, `CreateFolderModal.jsx`, `MoveToFolderModal.jsx`. Services: `knowledgeService.js`, `knowledgeFolderService.js`.

### Global AI Preferences (Settings → AI Preferences)
User name, language, expertise; tone; response style; custom instructions (≤2000 chars); enable toggle. Injected into ALL LLM calls (chat, arena, debate, workflow). Stored on `user.ai_preferences`. Composed via `OpenRouterService.build_enhanced_system_prompt()`.

### Telegram Bot Gateway (`bot/` service)
Linked uni-chat users chat from inside Telegram (text only, v1). Separate `aiogram v3` process (NOT in Flask), shares MongoDB + OpenRouter. Bot polls in dev (`POLLING=1`); webhook in prod at `https://<your-api-domain>/telegram/webhook/<secret>` proxied to `127.0.0.1:8081`.

- **Linking flow**: user opens Settings → Telegram → "Link Telegram" → backend mints one-time token via `TelegramLinkTokenModel.create()` (10-min TTL) → opens `t.me/<TELEGRAM_BOT_USERNAME>?start=<token>` → bot's `/start <token>` handler consumes token + sets `users.telegram_id` (unique sparse index).
- **Slash commands**: `/start`, `/new`, `/model`, `/assistant`, `/history`, `/unlink`, `/help`. `/model` and `/assistant` show inline keyboards (5 quick models + up to 10 saved assistants from `LLMConfigModel.find_by_owner`).
- **Streaming**: `bot/services/stream.py` adaptive edit-in-place — buffer ≥80 chars OR ≥1.2s since last edit. Markdown → Telegram-HTML allowlist (`<b><i><code><pre><a><blockquote>`) via `bot/services/format.py`. Splits at 4000 chars to stay under Telegram's 4096 cap.
- **Rate limit**: sliding window stored on `users.telegram_rate_limit` — 20 msg/60s. Bypassed for ADMIN_EMAIL.
- **State**: `users.telegram_active_conversation_id` + `telegram_active_config_id` + `telegram_rate_limit`. Conversations created with `title='Telegram chat'`, visible in web app immediately.
- **Reuses**: `OpenRouterService.chat_completion(stream=True)`, `MessageModel.create_user_message`/`create_assistant_message`/`get_context_messages`, `ConversationModel.create`/`increment_message_count`, `resolve_config`, `UserModel.get_ai_preferences`, `OpenRouterService.build_enhanced_system_prompt`.

Backend pieces: `app/models/telegram_link_token.py`, `app/routes/telegram_link.py` (registered at `/api/users/telegram` — `/status`, `/generate-token`, `/unlink`), three new `UserModel` staticmethods (`find_by_telegram_id`, `set_telegram_link`, `clear_telegram_link`).
Frontend: `pages/dashboard/components/TelegramLinkPanel.jsx` + `services/telegramService.js` + new tab in `SettingsPage.jsx`.
Deploy: `deploy/unichat-bot.service` (systemd), `deploy/nginx-telegram.conf`, `.github/workflows/deploy-bot.yml`. Setup checklist + BotFather commands in `bot/README.md`.

### Routines — scheduled LLM tasks (`/routines` + `scheduler/` service)
User-defined cron-scheduled tasks. v1 actions: **chat prompt** (single LLM call) + **workflow** (existing React Flow graph). Outputs (multi-select per routine): chat conversation, knowledge vault folder, Telegram DM. Recurring + one-shot supported.

- **Schedule UX**: preset dropdown (Hourly / Daily 9 AM / Weekdays 9 AM / Weekly Mon / Monthly 1st / Custom) + natural-language fallback ("every weekday 9am" → cron via `google/gemini-2.5-flash-lite` parser). Raw cron field editable. Next-5 fires preview rendered in user's TZ.
- **Per-user TZ**: new `users.timezone` field (IANA), set in Settings → AI Preferences. Defaults to `'UTC'`. Validated via `zoneinfo.ZoneInfo`. Requires `tzdata` on Windows.
- **Limits / policies**: 20 active routines/user (admin unlimited); overlap = skip if previous still running (`max_instances=1`); retry 1× after 60 s on failure; history capped to last 50 runs/routine; no backfill (`coalesce=True, misfire_grace_time=300`); per-routine `enabled` toggle.

**Architecture**: separate `scheduler/` systemd unit (mirrors `bot/` pattern — own `.venv-uv`, `pip install -e ../backend` for shared models, dotenv-first import order). APScheduler `AsyncIOScheduler` + `MongoDBJobStore('routines_apscheduler')`. aiohttp HTTP server on `127.0.0.1:8082` exposing `/internal/reload`, `/internal/run-now`, `/internal/health`. Backend posts to it via `app/utils/scheduler_client.py` after every routine CRUD. Sync poll every 30 s reconciles APScheduler from `routines` collection (covers any missed reload pings).

**Job lifecycle**: backend writes routine → POST `/internal/reload` → scheduler `sync.upsert_job` builds `CronTrigger(cron_expr, timezone=...)` or `DateTrigger(run_at, ...)`. On fire, `executor.run_routine(routine_id_str)` (registered as the import string `'scheduler.executor:run_routine'` because `MongoDBJobStore` pickles by path) wraps backend model calls in `flask_app.app_context()`, dispatches to chat or workflow path, then `delivery.fan_out` writes to chat / knowledge / telegram channels (chat + knowledge under app_context; Telegram fresh `aiogram.Bot` outside it). On exception, `retry.py` listens for `EVENT_JOB_ERROR`, schedules one-shot retry +60 s; second failure → `RoutineRunModel.fail`.

Backend pieces:
- `app/models/routine.py`, `routine_run.py` (collections `routines`, `routine_runs` — purge_to_50 helper)
- `app/routes/routines.py` (CRUD + run-now + toggle, registered at `/api/routines`), `routes/routines_nl.py` (`POST /parse-schedule`)
- `app/utils/cron_presets.py` (preset map + `validate_cron`), `app/utils/scheduler_client.py` (best-effort HTTP notify, `SCHEDULER_BASE_URL` env)
- `app/utils/telegram_format.py` — moved from `bot/bot/services/format.py` so scheduler can reuse without cross-service import. Bot's `bot/services/format.py` is now a thin re-export shim.
- `UserModel.update_timezone` / `get_timezone`; `ai_preferences` route accepts/returns `timezone`.
- New deps: `croniter`, `tzdata`. **NOT** `apscheduler`/`aiogram` — those are scheduler-only.

Scheduler pieces (`scheduler/scheduler/`):
- `__init__.py` does `load_dotenv(scheduler_dir/'.env', override=True)` BEFORE any `app.*` import (same gotcha as bot — Config class locks in empty env vars otherwise)
- `main.py` (entry — APScheduler + aiohttp on same loop), `settings.py`, `flask_ctx.py`, `jobstore.py`
- `sync.py` (upsert/delete/full_reconcile/tick), `executor.py`, `delivery.py`, `retry.py`

Frontend pieces:
- `pages/routines/RoutinesPage.jsx` + `components/{RoutineCard,RoutineEditor,ScheduleBuilder,ActionBuilder,OutputSelector,RunHistoryPanel}.jsx`
- `services/routinesService.js`; `Sidebar.jsx` "Routines" entry (Create section, `CalendarClock` icon); `App.jsx` lazy `/routines` route
- `SettingsPage.jsx` AI Preferences tab — new Timezone field using `Intl.supportedValuesOf('timeZone')` w/ common-zones group at top

Reuses: `OpenRouterService.chat_completion(stream=False)`, `build_enhanced_system_prompt`, `config_resolver.resolve_config`, `ConversationModel.create / increment_message_count`, `MessageModel.create_user_message / create_assistant_message`, `KnowledgeFolderModel.create`, `KnowledgeItemModel.create`, `WorkflowService.execute_workflow`, `LLMConfigModel.find_by_owner`, `ConfigSelector.jsx` + `ModelChip.jsx`.

Deploy: `deploy/unichat-scheduler.service` (systemd unit, mirrors `unichat-bot.service` shape), `.github/workflows/deploy-scheduler.yml` (triggers on `scheduler/**` or `backend/app/**`).

### Code Canvas (in chat)
Run button on HTML/CSS/JS code blocks → resizable side panel w/ live preview, console, share dialog. Components in `components/chat/CodeCanvas/`: `index.jsx`, `CodeEditor.jsx`, `CodePreview.jsx`, `ConsolePanel.jsx`, `CodeCanvasPanel.jsx` (300–800px), `ShareDialog.jsx`. Auto-run 500ms debounce. Public sharing → `/canvas/:shareId`. Manage at `/my-canvases`. Backend: `/api/canvas` + `shared_canvases` collection. Security: `srcdoc` + `sandbox="allow-scripts"` only (NO `allow-same-origin`). Deps: `@uiw/react-codemirror`, `@uiw/codemirror-extensions-langs`, `@uiw/codemirror-theme-vscode`, `react-resizable-panels`.

### Landing Page (`/`)
Public page; logged-in users redirect to `/chat` via `LandingRedirect` in `App.jsx`. Three.js particle background (250 particles + 10 spheres) in `components/landing/ParticleBackground.jsx`. dotLottie hero animation (`@lottiefiles/dotlottie-react`, `public/animations/hero-animation.lottie`). Sections: Navbar, Hero, Features, Demo, Stats, CTA, Footer in `pages/landing/components/`. Hooks: `pages/landing/hooks/useScrollReveal.js` (scroll reveal + count-up).

---

## Database (MongoDB)

Collections: `users`, `conversations`, `messages`, `llm_configs`, `folders`, `usage_logs`, `audit_logs`, `generated_images`, `arena_sessions`, `arena_messages`, `workflows`, `workflow_runs`, `shared_canvases`, `knowledge_items`, `knowledge_folders`, `debate_sessions`, `debate_messages`, `automate_tasks`, `automate_messages`, `telegram_link_tokens`, `routines`, `routine_runs`, `routines_apscheduler` (APScheduler MongoDBJobStore — separate from `routines`, do NOT conflate).

Telegram fields on `users`: `telegram_id` (int, unique sparse index), `telegram_username`, `telegram_linked_at`, `telegram_active_conversation_id`, `telegram_active_config_id`, `telegram_rate_limit`. `telegram_link_tokens` has TTL index on `expires_at` (10 min).

Routines fields on `users`: `timezone` (IANA, default `'UTC'`). `routines` indexes: `(user_id, created_at desc)`, `(enabled, next_run_at)`. `routine_runs` index: `(routine_id, started_at desc)`; capped via `RoutineRunModel.purge_to_50` (called by scheduler after each run).

**Local dev MongoDB**: data dir is `C:\Program Files\MongoDB\Server\8.2\data`, log at `C:\Program Files\MongoDB\Server\8.2\log\mongod.log` (configured in `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`). Service `MongoDB` (`Get-Service MongoDB`). Reverted from `D:\MongoDB\data` on 2026-04-28 because chat history vanished after the path change — the service had come up on a fresh empty `dbPath`, old data still on C:. If you ever switch dbPath again: stop service first, copy WT files across, then restart.

---

## Environment Variables (`backend/.env`)

```
SECRET_KEY=<random>
JWT_SECRET_KEY=<random>
OPENROUTER_API_KEY=<key>
BROWSER_USE_API_KEY=<bu_key>
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/unichat?retryWrites=true&w=majority
ADMIN_EMAIL=admin@admin.com
ADMIN_PASSWORD=admin123
TELEGRAM_BOT_USERNAME=unichat_ai_bot
```

MONGO_URI must include database name before query params (see Known Issues).

Bot env (`bot/.env`, gitignored — separate file from `backend/.env`):
```
TELEGRAM_BOT_TOKEN=<from BotFather>
TELEGRAM_WEBHOOK_SECRET=<32-byte random>
TELEGRAM_BOT_USERNAME=unichat_ai_bot
WEBHOOK_URL=https://<your-api-domain>/telegram/webhook/   # blank for polling-only dev
MONGO_URI=<same as backend/.env>
OPENROUTER_API_KEY=<same>
BOT_PORT=8081
POLLING=0   # 1 in dev, 0 in prod
```

Backend env addition for scheduler integration:
```
SCHEDULER_BASE_URL=http://127.0.0.1:8082   # default; backend POSTs CRUD notifications here
```

Scheduler env (`scheduler/.env`, gitignored — separate file):
```
MONGO_URI=<same as backend/.env>
OPENROUTER_API_KEY=<same>
TELEGRAM_BOT_TOKEN=<same as bot/.env>     # delivery channel uses fresh aiogram.Bot client
RELOAD_PORT=8082
```

---

## Production Deployment

- **Frontend**: Vercel (domain TBD — set in Vercel project + update `frontend/vercel.json` rewrite destinations). Auto-deploys on push to `main`. `vercel.json` proxies `/api/*` and `/socket.io/*` to backend.
- **Backend**: domain TBD — Ubuntu 22.04 LTS @ `65.109.211.140`. Cloudflare → Nginx (Cloudflare Origin Cert) → Gunicorn (gthread workers, needed for SSE) → Flask → MongoDB Atlas.
- **Domain note**: previous `sepijan.xyz` is no longer owned. Replace `your-domain.example` placeholders in `frontend/vercel.json`, `bot/.env.example`, `bot/README.md`, `deploy/nginx-telegram.conf`, and the WEBHOOK_URL env before re-deploying.

Gunicorn config (`backend/gunicorn.conf.py`): `worker_class="gthread"`, `workers=2`, `threads=4`, `bind="127.0.0.1:5000"`, `timeout=120`.

Service ops:
```bash
systemctl status unichat
systemctl restart unichat
journalctl -u unichat -f
```

- **Bot**: separate systemd unit `unichat-bot` running aiogram on `127.0.0.1:8081`. Nginx proxies `/telegram/webhook/` to it. Auto-deploys via `.github/workflows/deploy-bot.yml` on `bot/**` or `backend/app/**` changes.
- **Scheduler**: separate systemd unit `unichat-scheduler` running `python -m scheduler.main` on `127.0.0.1:8082` (internal-only, no Nginx exposure). Auto-deploys via `.github/workflows/deploy-scheduler.yml` on `scheduler/**` or `backend/app/**` changes. Reachable from Flask via `SCHEDULER_BASE_URL` env (defaults to `http://127.0.0.1:8082`).
```bash
systemctl status unichat-bot
systemctl restart unichat-bot
journalctl -u unichat-bot -f

systemctl status unichat-scheduler
systemctl restart unichat-scheduler
journalctl -u unichat-scheduler -f
```

Auto-deploy: `.github/workflows/deploy-backend.yml` runs on push to `main` when `backend/**` changes — SSHes to server, pulls, installs deps, restarts systemd unit. Required GitHub secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`. Same auto-deploy pattern for `unichat-scheduler` via `deploy-scheduler.yml`.

---

## Common Patterns

**Add backend route**: create `app/routes/<name>.py` w/ Blueprint → register in `app/__init__.py` → use `@jwt_required()` for protected endpoints. Avoid `/` root path on JWT routes (see Known Issues).

**Add socket event**: handler in `app/sockets/*_events.py`. Use `eventlet.spawn()` for parallel ops. **CRITICAL**: do DB ops in main handler (not greenlets) to avoid app context errors.

**Add frontend page**: create in `src/pages/` → lazy import + Route in `App.jsx` → nav item in `Sidebar.jsx`.

---

## Multi-Agent Development

| Scenario | Agent | Model |
|----------|-------|-------|
| Multi-file feature across stack | `orchestrator` | Opus |
| Backend-only (API, models, sockets) | `backend-agent` | Sonnet |
| Frontend-only (UI, services, styling) | `frontend-agent` | Sonnet |
| Complex refactoring | `orchestrator` | Opus |
| Bug fix (known location) | direct agent | — |

Agent files in `.claude/agents/`. Parallelize backend + frontend when independent; sequence when frontend depends on backend API. Auto-commit after each phase: `git add -A && git commit -m "<type>: <desc>" && git push`. Prefixes: `backend:` | `frontend:` | `feat:` | `fix:` | `refactor:`.

---

## Known Issues

### Flask root-path JWT 401
`@blueprint.route('/')` causes trailing-slash redirects that drop JWT. Use named subpaths:
```python
@bp.route('/list', methods=['GET'])  # not '/'
@jwt_required()
```

### JWT secret key length (HS256)
PyJWT 2.10+ raises `InsecureKeyLengthWarning` if `JWT_SECRET_KEY` < 32 bytes (RFC 7518). Generate with:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Rotating the key invalidates every issued access/refresh token — all browsers logged out once. `.env.example` placeholders are intentionally ≥32 bytes; do not shorten.

### JWT diagnostic loaders
`backend/app/extensions.py` registers `expired_token_loader` / `invalid_token_loader` / `unauthorized_loader` / `revoked_token_loader`. Every 401 from `@jwt_required` is preceded by a structured log line (`jwt expired|invalid|missing|revoked: reason=... path=...`) and returns JSON `{error, code, detail?}`. Frontend interceptor only checks status, so response shape is safe to extend.

### Eventlet greenlets + Flask app context
DB calls in greenlets fail with "Working outside of application context." Fetch data in main socket handler before `eventlet.spawn()`, pass pre-fetched data into greenlet, OR wrap with `app.app_context()`.

### Eventlet × asyncio collision (bot AND scheduler must be separate processes)
The Telegram bot AND the routines scheduler both use asyncio (aiogram / APScheduler `AsyncIOScheduler`). If either is imported into the Flask process, eventlet's monkey-patched sockets break asyncio's selector. Run `bot/` and `scheduler/` as their own systemd units. Both reuse backend models/services via `pip install -e ../backend` + `with flask_app.app_context():` around DB calls (pattern from `backend/app/routes/automate_agent_stream.py`).

### Bot AND scheduler dotenv must load before any `app.*` import
Backend's `app/config.py` reads `os.environ` at class-definition time (`OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')`). If any `app.*` import runs before `load_dotenv()`, the Config class locks in empty values and every OpenRouter call returns `401 Unauthorized` — even though the `.env` is well-formed. Fix lives in `bot/bot/__init__.py` and `scheduler/scheduler/__init__.py`: each calls `load_dotenv(<dir>/'.env', override=True)` at package import time, BEFORE `flask_ctx.py` does `from app import create_app`. Don't reorder.

### Bot AND scheduler tests need `setuptools<81`
`mongomock` (pulled in by `pytest-mongodb`) does `import pkg_resources`, which `setuptools>=81` removed. After `uv pip install`, pin: `uv pip install "setuptools<81"`. Same fix applies to backend tests.

### `tzdata` required on Windows for routines TZ validation
`zoneinfo.ZoneInfo('America/Los_Angeles')` raises `ZoneInfoNotFoundError` on Windows because the system tzdata DB is absent. `tzdata` is in `backend/requirements.txt` (and must also be in `scheduler/pyproject.toml`). Without it, the `users.timezone` validator and `croniter` next-fire computation both fail.

### APScheduler MongoDBJobStore pickles callable by import path
Register the scheduler job callable as a string `'scheduler.executor:run_routine'`, NOT as a function reference. MongoDBJobStore stores the import path; if you pass the function object, jobs persisted to the store can't be revived after a scheduler restart and silently disappear. The collection used is `routines_apscheduler` — kept distinct from the user-facing `routines` collection. Don't conflate.

### Scheduler reload uses HTTP push, not Mongo change streams
Local dev MongoDB is a standalone (no replica set), and change streams require a replica set. Backend → scheduler sync therefore uses best-effort HTTP POST to `/internal/reload` after every routine CRUD; scheduler also runs a 30 s reconcile-poll as fallback. `app/utils/scheduler_client.py` swallows connection errors so scheduler downtime doesn't break the API — the next poll picks up the change.

### Two backends competing on :5000 (dev)
If both main repo and a worktree run `python run.py`, both bind :5000 (Windows allows it via SO_REUSEADDR). OS load-balances connections — requests randomly hit one or the other. Symptom: new routes return 404 from one backend but exist in the other. Diagnose with `netstat -ano | grep :5000.*LISTENING`, identify processes via `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, kill the stale one. Same applies if you run main + worktree frontends — Vite shifts to 3001+ automatically.

### Pyright workspace doesn't auto-discover `bot/.venv-uv`
Pyright sees only the workspace's primary interpreter, so all `bot/` imports show `reportMissingImports`. The runtime is fine — diagnostics are false positives. To silence, configure `python.analysis.extraPaths` in workspace settings to include `bot/.venv-uv/Lib/site-packages` and `backend/.venv-uv/Lib/site-packages`, or add a `bot/pyrightconfig.json`.

### `LLMConfigModel` method is `find_by_owner` (not `find_by_user`)
Signature: `find_by_owner(owner_id, skip=0, limit=50)`. Easy to misremember; bot's `/model` and `/assistant` handlers use this.

### react-resizable-panels v4 import names
v4 renamed exports. Use:
```javascript
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
// v3 names {PanelGroup, PanelResizeHandle} are gone
```
Also: `direction` → `orientation`, `ref` → `panelRef`.

### React Three Fiber + React 18
`@react-three/fiber@9` requires React 19. Pin v8 + drei@9:
```bash
npm install @react-three/fiber@8 @react-three/drei@9 three
```

### OpenRouter video `unsigned_urls` need Bearer auth
`/videos/{id}/content?index=0` URLs look public but return 401 without `Authorization`. Reuse poll headers when downloading mp4 — see `OpenRouterService.generate_video()` in `backend/app/services/openrouter_service.py`. Completed jobs are purged quickly; if download fails, gen ID becomes `404 Job not found` and user must re-run (re-billed).

### OpenRouter image-gen model IDs drift
OpenRouter retires/renames image-gen models silently. Hardcoded IDs return `404 Not Found for url: /api/v1/chat/completions` and surface as a generic "Workflow execution failed" toast (per-node error not propagated).

Verify live models:
```bash
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  "https://openrouter.ai/api/v1/models" | \
  jq '.data[] | select(.architecture.output_modalities[]? == "image") | .id'
```

Currently live (verified 2026-04-25): `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `openai/gpt-5.4-image-2`.

When refreshing, update ALL of:
- `backend/app/services/openrouter_service.py` — `IMAGE_GENERATION_MODELS`, `IMAGE_GENERATION_LIMITS`, `get_image_capable_models()`
- `backend/app/routes/workflow_ai.py` — AI generator system prompt + fallback default
- `backend/scripts/seed.py` — 35 imageGen template nodes (shared default)
- `frontend/src/components/workflow/ImageGenNode.jsx` — `MODELS` dropdown
- `frontend/src/pages/workflow/hooks/useWorkflowState.js` — default model for new imageGen node
- Patch saved DB workflows:
  ```js
  db.workflows.updateMany(
    {'nodes.data.model': '<old-id>'},
    {$set: {'nodes.$[n].data.model': '<new-id>'}},
    {arrayFilters: [{'n.data.model': '<old-id>'}]}
  )
  ```
- Re-run `python scripts/seed.py --workflows` to refresh templates.

### MongoDB Atlas connection string
Missing database name before query params yields `'NoneType' object is not subscriptable`. Correct form:
```
mongodb+srv://user:pass@cluster.mongodb.net/unichat?retryWrites=true&w=majority
```

### Bot AND scheduler are personal-scope only (v1)

Project-scoped LLM configs and workflows are NOT visible to the Telegram bot
or scheduled routines. The bot's `/assistant` filters `project_id is None`
in `bot/bot/handlers/commands.py`. The scheduler refuses to execute a routine
whose config or workflow has `project_id` set unless the routine's user is
also the resource owner. This is enforced at the executor level
(`scheduler/scheduler/executor.py`) AND through `resolve_config(config_id,
user_id, project_id=None)` — passing `project_id=None` (the bot/scheduler
default) makes the resolver return `None` for any project-scoped config.

A future phase ("Phase 6") will add per-user project switching to the bot
and per-project routines to the scheduler.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, React Query, Socket.IO, React Flow, CodeMirror 6, Lucide, react-resizable-panels v4, shadcn/ui, Motion (Framer Motion).
- **3D / animations**: three, `@react-three/fiber@8`, `@react-three/drei@9`, `@lottiefiles/dotlottie-react`.
- **Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet, Gunicorn.
- **Bot**: aiogram v3 (asyncio), aiohttp (webhook server), pydantic-settings, markdown-it-py.
- **Scheduler**: APScheduler 3 `AsyncIOScheduler` + `MongoDBJobStore`, aiohttp (reload endpoint), aiogram (Telegram delivery channel), croniter, tzdata.
- **DB**: MongoDB Atlas (prod), local Mongo (dev).
- **AI**: OpenRouter API.
- **Deploy**: Vercel (frontend), Ubuntu + Nginx + systemd (backend + bot — separate units), GitHub Actions (CI/CD).

---

## UI Library

shadcn/ui components live in `frontend/src/components/ui/`. Import via path alias:
```jsx
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
```
Path alias `@/` configured in `vite.config.js` + `jsconfig.json`. Motion presets in `frontend/src/utils/animations.js` (`buttonVariants`, `iconButtonVariants`, `fadeInUp`, `fastTransition`). Prefer shadcn over custom HTML for buttons/inputs/modals/cards. Wrap icon buttons in `<Tooltip>` for a11y.

---

## Testing

Backend uses **uv** (no conda). One-time setup:
```bash
cd backend
uv venv .venv-uv --python 3.12
uv pip install -r requirements.txt -r requirements-test.txt
```

Run:
```bash
cd backend
./.venv-uv/Scripts/python.exe -m pytest          # all
./.venv-uv/Scripts/python.exe -m pytest -v       # verbose
./.venv-uv/Scripts/python.exe -m pytest --cov=app # coverage
```

Notes:
- `.venv-uv/` (not `.venv/`) avoids a recurring Windows lock issue when uv tries to recreate `.venv`.
- Standalone `bson` package shadows `pymongo`'s bundled bson. The uv venv stays clean — never `pip install bson` into it.

Test DB: `mongodb://localhost:27017/unichat_test`.
