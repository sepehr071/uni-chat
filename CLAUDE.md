# CLAUDE.md

Full-stack AI chat: Flask backend + React frontend + OpenRouter. Streaming chat, image gen, workflow editor, arena, debate, knowledge vault, Telegram bot, routines scheduler.

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

Local MongoDB on `:27017`. Each service loads own `.env`.

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
| Migrate workspaces | `cd backend && ./.venv-uv/Scripts/python.exe scripts/migrate_workspaces.py [--dry-run]` |
| Migrate projects | `cd backend && ./.venv-uv/Scripts/python.exe scripts/migrate_projects.py [--dry-run] [--move-personal]` |
| Migrate resource scoping | `cd backend && ./.venv-uv/Scripts/python.exe scripts/migrate_resource_scoping.py [--audit-only] [--dry-run]` |

---

## Architecture

### Backend (`backend/app/`)
```
├── models/      # MongoDB models
├── routes/      # API blueprints (auth, chat, configs, arena, workflow, canvas, knowledge, debate, automate_agent, workspaces, projects, ...)
├── services/    # openrouter_service.py, browser_use_service.py, debate_service.py
├── sockets/     # chat_events, arena_events
└── utils/       # decorators (@admin_required, @workspace_member, @project_role), permissions.py, helpers, error handlers, config_resolver
```

### Frontend (`frontend/src/`)
```
├── constants/   # models.js (quick models)
├── context/     # AuthContext (JWT), SocketContext (WebSocket), WorkspaceContext, ProjectContext
├── services/    # API clients (chat, arena, image, workflow, canvas, debate, knowledge, knowledgeFolder, aiPreferences, workspace, project)
├── pages/       # auth, dashboard, chat, arena, debate, workflow, canvas, knowledge, automate-agent, landing, admin, projects, workspaces
└── components/  # chat/, layout/ (incl. WorkspaceSwitcher), config/, arena/, workflow/, projects/, common/, ui/ (shadcn), landing/
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
Separate `bot/.venv-uv`. Reuses backend `app` via `pip install -e ../backend`.

### Scheduler (`scheduler/scheduler/`)
`__init__.py` (dotenv-first), `main.py` (APScheduler + aiohttp), `settings.py`, `flask_ctx.py`, `jobstore.py`, `sync.py`, `executor.py`, `delivery.py`, `retry.py`. Own `.venv-uv`, `pip install -e ../backend`.

---

## Features

### Chat & Arena
Socket.IO streaming `send_message → message_chunk → message_complete`. Arena = 2–4 configs in parallel via eventlet greenlets. Model picker = `ModelChip.jsx` + `ConfigSelector.jsx` (Radix Popover + cmdk). Branching via `useChatBranches`. Auto-title via `google/gemini-2.5-flash-lite`. Vision via multimodal. Hooks: `useChatMessages`, `useChatStream`, `useChatBranches`, `useChatExport`.

### Image Generation (`/image-studio`, `/image-history`)
Models: `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `openai/gpt-5.4-image-2`. Text-to-image + image-to-image.

### Workflow Editor (`/workflow`)
React Flow canvas. Nodes: `imageUpload`, `imageGen`, `textInput`, `aiAgent`, `ttsNode`, `videoGenNode`. Topological exec, save/load, history, JSON export. 15 templates via `python scripts/seed.py --workflows`. AI Agent models: Gemini 3 Flash, Gemini 2.5 Lite, Grok 4.1 Fast, GPT-5.2. TTS = `openai/gpt-4o-mini-tts`. Video = Veo 3.1 img2vid. Auto-save 5s debounced. "Generate with AI" → `/api/workflow-ai/generate`.

Files: `pages/workflow/WorkflowPage.jsx`, `pages/workflow/components/` (Breadcrumb, NodeRail, NodeInspector, CanvasCommandBar, CanvasZoomBar, RunHistoryPanel, LoadWorkflowModal, EmptyCanvasState), `pages/workflow/components/inspectors/` (6 + `NodeConfigForm.jsx`), `pages/workflow/hooks/useWorkflowState.js`, `components/workflow/CompactNodeShell.jsx`.

**SMM enhancements (post Phase A+B):** Display labels for nodes are marketer-facing (Copywriter / Image / Voiceover / Video / Brief / Reference Image) but **internal node `type` strings stay `aiAgent` / `imageGen` / `ttsNode` / `videoGenNode` / `textInput` / `imageUpload`** — never rename the type strings.

- Copywriter (aiAgent) gains: `knowledge_folder_id` (brand-brief inject via `<BRAND_BRIEF>` block, 8000-char cap, owner-or-same-project auth), `variants` ∈ {1,3,5,10} (parallel ThreadPoolExecutor, returns `text_variants[]` AND `text = text_variants[0]` for back-compat), `platform_preset` + `max_chars` (PLATFORM_LIMITS soft-truncates above limit).
- Image (imageGen) gains: `aspect_ratio` (1:1 / 9:16 / 16:9 / 4:5) + `style_preset` — both injected as **prompt suffix** because `OpenRouterService.generate_image()` has no size param yet.
- Templates have `category` (e.g. `'social-media'`); LoadWorkflowModal filters via chip row. 8 SMM templates added on top of 15 generic.
- `OutputActionBar` (Copy / Download / Save-to-Knowledge / Open-in-Chat) wired into all 5 inspectors. Saving non-text outputs writes a text-pointer record (`[Image] <url>`), not the data URI (50000-char content cap).
- Schedule button → `ScheduleWorkflowModal` wraps existing `RoutineEditor` with `action.kind='workflow'` + `action.workflow_id`.
- Auto-save: 5s debounced, fires when `nodes.length > 0` even for never-saved workflows (`useWorkflowState.js:813`). Empty canvas + name edit does NOT auto-save.

### Automate Agent (`/automate-agent`)
NL browser automation via [browser-use Cloud](https://docs.browser-use.com). Models: `claude-sonnet-4.6` (default), `claude-opus-4.6`, `gpt-5.4-mini`. Auth: `X-Browser-Use-API-Key` header (NOT Bearer); env `BROWSER_USE_API_KEY`.

Backend: `services/browser_use_service.py`, `models/automate_task.py`, `automate_message.py`, `routes/automate_agent.py` (CRUD), `routes/automate_agent_stream.py` (SSE; 2s poll, 15s keepalive, 30min cap).
Frontend: `pages/automate-agent/AutomateAgentPage.jsx`, `TaskInput.jsx`, `LiveBrowserFrame.jsx`, `EventStream.jsx`, `TaskHistorySidebar.jsx`, `hooks/useAutomateAgentState.js`.

### Debate Mode (`/debate`)
2–5 LLMs in rounds (0=infinite, cap 20). Judge LLM verdict. SSE streaming. Infinite mode: `[DEBATE_CONCLUDED]` marker (stripped). Settings: thinking type, response length.

Backend: `debate_session.py`, `debate_message.py`, `debate_service.py`. Frontend: `DebatePage.jsx`, `DebateSetup.jsx`, `DebateArena.jsx`, `DebaterResponse.jsx`, `JudgeVerdict.jsx`.

### Quick Models (Chat & Debate)
5 default, no custom assistant needed:
- `google/gemini-3-flash-preview` — Gemini 3 Flash
- `x-ai/grok-4.1-fast` — Grok 4.1 Fast
- `google/gemini-2.5-flash-lite` — Gemini 2.5 Lite
- `openai/gpt-5.2` — GPT-5.2
- `anthropic/claude-sonnet-4.5` — Claude Sonnet 4.5

IDs prefixed `quick:`. Defs in `frontend/src/constants/models.js`. Resolved via `utils/config_resolver.py`.

### Knowledge Vault (`/knowledge`)
Bookmark AI responses. Folders, tags, search, favorites, markdown detail.

Backend: `knowledge_item.py`, `knowledge_folder.py`, `/api/knowledge`, `/api/knowledge-folders`. Frontend: `KnowledgePage.jsx`, `KnowledgeCard.jsx`, `KnowledgeDetailModal.jsx`, `KnowledgeFolderSidebar.jsx`, `CreateFolderModal.jsx`, `MoveToFolderModal.jsx`. Services: `knowledgeService.js`, `knowledgeFolderService.js`.

### Global AI Preferences (Settings → AI Preferences)
Name, language, expertise, tone, style, custom instructions (≤2000 chars), enable toggle. Stored on `user.ai_preferences`. Composed via `OpenRouterService.build_enhanced_system_prompt()`. Injected into all LLM calls.

### Telegram Bot Gateway (`bot/`)
Linked users chat in Telegram. Separate `aiogram v3` process. Polling dev (`POLLING=1`), webhook prod at `https://<your-api-domain>/telegram/webhook/<secret>` → `127.0.0.1:8081`.

- Linking: `TelegramLinkTokenModel.create()` (10-min TTL) → `t.me/<TELEGRAM_BOT_USERNAME>?start=<token>` → `/start <token>` sets `users.telegram_id`.
- Commands: `/start`, `/new`, `/model`, `/assistant`, `/project`, `/history`, `/unlink`, `/help`. `/model` + `/assistant` show inline keyboards (5 quick models + ≤10 from `LLMConfigModel.find_visible_to(uid, project_id=<active>)`). `/project` switches active project scope.
- Streaming: `bot/services/stream.py` adaptive edit-in-place (≥80 chars OR ≥1.2s). Markdown → Telegram-HTML allowlist via `bot/services/format.py`. Splits at 4000 chars.
- Rate limit: 20 msg/60s on `users.telegram_rate_limit`. Bypassed for ADMIN_EMAIL.
- State: `users.telegram_active_conversation_id` + `telegram_active_config_id` + `telegram_rate_limit`.

Backend: `app/models/telegram_link_token.py`, `app/routes/telegram_link.py` (`/api/users/telegram` — `/status`, `/generate-token`, `/unlink`), `UserModel.find_by_telegram_id` / `set_telegram_link` / `clear_telegram_link`.
Frontend: `pages/dashboard/components/TelegramLinkPanel.jsx`, `services/telegramService.js`, `SettingsPage.jsx` tab.
Deploy: `deploy/unichat-bot.service`, `deploy/nginx-telegram.conf`, `.github/workflows/deploy-bot.yml`.

### Routines (`/routines` + `scheduler/`)
Cron-scheduled LLM tasks. v1 actions: chat prompt, workflow. Outputs: chat conversation, knowledge folder, Telegram DM. Recurring + one-shot.

- Schedule UX: preset dropdown + NL fallback ("every weekday 9am") via `google/gemini-2.5-flash-lite`. Raw cron editable. Next-5 fires preview.
- Per-user TZ: `users.timezone` (IANA, default `'UTC'`). Validated via `zoneinfo.ZoneInfo`. Needs `tzdata` on Windows.
- Limits: 20 active/user, `max_instances=1`, retry 1× +60s, history capped 50/routine, `coalesce=True, misfire_grace_time=300`.
- Architecture: separate systemd unit. APScheduler `AsyncIOScheduler` + `MongoDBJobStore('routines_apscheduler')`. aiohttp on `127.0.0.1:8082` exposing `/internal/reload`, `/internal/run-now`, `/internal/health`. Backend pushes via `app/utils/scheduler_client.py`. 30s reconcile-poll fallback.
- Job lifecycle: backend → POST `/internal/reload` → `sync.upsert_job` builds `CronTrigger`/`DateTrigger`. On fire, `executor.run_routine(routine_id_str)` (registered as string `'scheduler.executor:run_routine'`) wraps in `flask_app.app_context()`, then `delivery.fan_out`. On error, `retry.py` listens for `EVENT_JOB_ERROR`, schedules +60s.

Backend: `app/models/routine.py`, `routine_run.py` (`routines`, `routine_runs`, purge_to_50), `app/routes/routines.py` (`/api/routines`), `routes/routines_nl.py` (`POST /parse-schedule`), `app/utils/cron_presets.py`, `app/utils/scheduler_client.py`, `app/utils/telegram_format.py` (moved from bot), `UserModel.update_timezone` / `get_timezone`. Deps: `croniter`, `tzdata` (NOT `apscheduler`/`aiogram`).

Frontend: `pages/routines/RoutinesPage.jsx` + `components/{RoutineCard,RoutineEditor,ScheduleBuilder,ActionBuilder,OutputSelector,RunHistoryPanel}.jsx`, `services/routinesService.js`, `Sidebar.jsx` entry, `SettingsPage.jsx` Timezone field via `Intl.supportedValuesOf('timeZone')`.

Deploy: `deploy/unichat-scheduler.service`, `.github/workflows/deploy-scheduler.yml`.

### Code Canvas (in chat)
Run button on HTML/CSS/JS code blocks → resizable side panel + live preview + console + share dialog. Files: `components/chat/CodeCanvas/{index,CodeEditor,CodePreview,ConsolePanel,CodeCanvasPanel,ShareDialog}.jsx`. 300–800px width. Auto-run 500ms debounce. Public share `/canvas/:shareId`. Manage `/my-canvases`. Backend: `/api/canvas` + `shared_canvases`. Security: `srcdoc` + `sandbox="allow-scripts"` only (NO `allow-same-origin`). Deps: `@uiw/react-codemirror`, `@uiw/codemirror-extensions-langs`, `@uiw/codemirror-theme-vscode`, `react-resizable-panels`.

### Enterprise Teams — Workspaces + Projects (`/projects`, `/invite/:token`)
Workspace → Project → Folder → Chat. Roles: owner / editor / viewer (`ROLE_HIERARCHY = {viewer:1, editor:2, owner:3}`).

- Auto-personal-workspace on signup via `UserModel.create()`. Migration `scripts/migrate_workspaces.py`.
- Workspace types: `'personal'` (immutable) + `'team'` (`POST /api/workspaces/create`).
- Invite: `POST /api/workspaces/<wid>/invites` → `/invite/:token` → `AcceptInvitePage` → `POST /api/workspaces/accept-invite`. Email-mismatch → 403 `invite_email_mismatch`. TTL 7 days via partial index on `accepted_at: None`.
- Projects nested in workspaces. `Folder` + `Conversation` carry nullable `project_id`. NULL = unfiled.
- Resource scoping: `LLMConfig`, `Workflow`, `KnowledgeFolder`, `KnowledgeItem` gain `project_id` + `workspace_id`. `LLMConfig.visibility` enum: `private | public | template | project`. `KnowledgeFolder` unique = `(scope_key, name)` where `scope_key = str(project_id) if project_id else f'u:{user_id}'`.
- Permissions: `app/utils/permissions.py` — `check_workspace_access`, `check_project_access` (project membership wins, falls back to workspace role). Decorators: `@workspace_member(min_role, id_kwarg='wid')`, `@project_role(min_role, id_kwarg='pid')`.
- Frontend: `WorkspaceProvider` / `ProjectProvider` in `App.jsx`. localStorage: `active_workspace_id`, `active_project_id::<wid>`. `WorkspaceSwitcher.jsx` cmdk popover.
- Picker cache keys include `currentProject?._id`.
- API: routes return FLAT JSON (Phase 1 fix `b9142e9`). Pre-team routes (`configs`, `knowledge_folders`) still wrap for back-compat.
- `cannot_reassign_project`: 400 on attempts to mutate `project_id`. Use `/move` route.
- Bot + scheduler are personal-scope only in v1.

Backend: `app/models/{workspace,workspace_member,workspace_invite,project,project_member}.py`, `app/utils/permissions.py`, `app/routes/{workspaces,projects}.py`, `scripts/{migrate_workspaces,migrate_projects,migrate_resource_scoping}.py`.
Frontend: `services/{workspaceService,projectService}.js`, `context/{WorkspaceContext,ProjectContext}.jsx`, `components/layout/WorkspaceSwitcher.jsx`, `components/projects/CreateProjectModal.jsx`, `components/chat/MoveChatToProjectModal.jsx`, `pages/projects/ProjectsPage.jsx`, `pages/auth/AcceptInvitePage.jsx`, `pages/dashboard/components/WorkspaceInvitesPanel.jsx`.

### Landing Page (`/`)
Public; logged-in users redirect to `/chat` via `LandingRedirect` in `App.jsx`. Three.js particles in `components/landing/ParticleBackground.jsx`. dotLottie hero (`@lottiefiles/dotlottie-react`, `public/animations/hero-animation.lottie`). Sections in `pages/landing/components/`. Hooks: `pages/landing/hooks/useScrollReveal.js`.

---

## Database (MongoDB)

Collections: `users`, `conversations`, `messages`, `llm_configs`, `folders`, `usage_logs`, `audit_logs`, `generated_images`, `arena_sessions`, `arena_messages`, `workflows`, `workflow_runs`, `shared_canvases`, `knowledge_items`, `knowledge_folders`, `debate_sessions`, `debate_messages`, `automate_tasks`, `automate_messages`, `telegram_link_tokens`, `routines`, `routine_runs`, `routines_apscheduler` (APScheduler — separate from `routines`), `workspaces`, `workspace_members`, `workspace_invites`, `projects`, `project_members`.

Workspace/Project fields:
- `users.active_workspace_id` (ObjectId | null).
- `workspaces`: `{name, slug, type:'personal'|'team', owner_id, plan, avatar, settings}`. Indexes: `owner_id`, unique `slug`.
- `workspace_members`: `{workspace_id, user_id, role, invited_by, invited_email, status:'pending'|'active'|'revoked', joined_at, created_at}`. Unique `(workspace_id, user_id)`; index `(user_id, status)`.
- `workspace_invites`: `{workspace_id, email, role, token, invited_by, expires_at, accepted_at, created_at}`. Unique `token`; unique `(workspace_id, email)`; partial TTL on `expires_at` filtered to `accepted_at: None`.
- `projects`: `{workspace_id, name, slug, color, icon, description, archived, created_by, created_at, updated_at}`. Indexes: `(workspace_id, archived)`, unique `(workspace_id, slug)`.
- `project_members`: `{project_id, user_id, role, added_by, created_at}`. Unique `(project_id, user_id)`; index `user_id`. Workspace owners = implicit project owners.

Scoping fields:
- `conversations`, `folders`: `project_id`. Indexes `(user_id, project_id, last_message_at desc)` / `(user_id, project_id, parent_id)` / `(user_id, project_id, order)`.
- `llm_configs`, `workflows`, `knowledge_folders`, `knowledge_items`: `project_id` + `workspace_id`. `llm_configs.visibility` adds `'project'`.
- `knowledge_folders`: `scope_key`. Unique `(scope_key, name)` replaces `(user_id, name)`. `KnowledgeFolderModel.create_indexes()` defensively drops legacy unique.

Telegram on `users`: `telegram_id` (unique sparse), `telegram_username`, `telegram_linked_at`, `telegram_active_conversation_id`, `telegram_active_config_id`, `telegram_active_project_id` (string ObjectId | None, lazy), `telegram_rate_limit`. `telegram_link_tokens` TTL on `expires_at` (10 min).

Routines on `users`: `timezone` (IANA, default `'UTC'`). `routines` adds `project_id` (ObjectId | None). Indexes: `(user_id, created_at desc)`, `(enabled, next_run_at)`, `(user_id, project_id, created_at desc)`. `routine_runs` index `(routine_id, started_at desc)`; capped via `RoutineRunModel.purge_to_50`.

Local dev MongoDB: `C:\Program Files\MongoDB\Server\8.2\data`, log `C:\Program Files\MongoDB\Server\8.2\log\mongod.log`, cfg `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`. Service `MongoDB` (`Get-Service MongoDB`). Switch dbPath: stop service, copy WT files, restart.

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

MONGO_URI must include database name before query params.

Bot env (`bot/.env`):
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

Backend → scheduler:
```
SCHEDULER_BASE_URL=http://127.0.0.1:8082
```

Scheduler env (`scheduler/.env`):
```
MONGO_URI=<same as backend/.env>
OPENROUTER_API_KEY=<same>
TELEGRAM_BOT_TOKEN=<same as bot/.env>     # delivery channel uses fresh aiogram.Bot client
RELOAD_PORT=8082
```

---

## Production Deployment

- **Frontend**: Vercel. `frontend/vercel.json` proxies `/api/*` + `/socket.io/*` to backend.
- **Backend**: Ubuntu 22.04 LTS @ `65.109.211.140`. Cloudflare → Nginx (Cloudflare Origin Cert) → Gunicorn (gthread for SSE) → Flask → MongoDB Atlas.
- **Domain**: `sepijan.xyz` no longer owned. Replace `your-domain.example` placeholders.

Gunicorn (`backend/gunicorn.conf.py`): `worker_class="gthread"`, `workers=2`, `threads=4`, `bind="127.0.0.1:5000"`, `timeout=120`.

```bash
systemctl status unichat
systemctl restart unichat
journalctl -u unichat -f
```

Bot: unit `unichat-bot` on `127.0.0.1:8081`, Nginx proxies `/telegram/webhook/`. Auto-deploy `.github/workflows/deploy-bot.yml`.
Scheduler: unit `unichat-scheduler` on `127.0.0.1:8082` (internal, no Nginx). Auto-deploy `.github/workflows/deploy-scheduler.yml`.

```bash
systemctl status unichat-bot
systemctl restart unichat-bot
journalctl -u unichat-bot -f

systemctl status unichat-scheduler
systemctl restart unichat-scheduler
journalctl -u unichat-scheduler -f
```

Auto-deploy: `.github/workflows/deploy-backend.yml` on `backend/**` push to `main`. Secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`.

---

## Common Patterns

- **Backend route**: `app/routes/<name>.py` Blueprint → register in `app/__init__.py` → `@jwt_required()`. Avoid `/` root path. Team-scoped: `@workspace_member` / `@project_role` from `app/utils/decorators.py`. Resolve project access in main socket handler before `eventlet.spawn()`.
- **Socket event**: handler in `app/sockets/*_events.py`. `eventlet.spawn()` for parallel. DB ops in main handler (NOT greenlets) to avoid app context errors.
- **Frontend page**: `src/pages/` → lazy import + Route in `App.jsx` → nav in `Sidebar.jsx`.

---

## Multi-Agent Development

| Scenario | Agent | Model |
|----------|-------|-------|
| Multi-file feature across stack | `orchestrator` | Opus |
| Backend-only (API, models, sockets) | `backend-agent` | Sonnet |
| Frontend-only (UI, services, styling) | `frontend-agent` | Sonnet |
| Complex refactoring | `orchestrator` | Opus |
| Bug fix (known location) | direct agent | — |

Agent files in `.claude/agents/`. Parallelize independent backend + frontend; sequence when frontend depends on backend. Auto-commit per phase: `git add -A && git commit -m "<type>: <desc>" && git push`. Prefixes: `backend:` | `frontend:` | `feat:` | `fix:` | `refactor:`.

---

## Known Issues

### Flask root-path JWT 401
`@blueprint.route('/')` causes trailing-slash redirects that drop JWT. Use named subpaths:
```python
@bp.route('/list', methods=['GET'])  # not '/'
@jwt_required()
```

### JWT secret key length (HS256)
PyJWT 2.10+ raises `InsecureKeyLengthWarning` if `JWT_SECRET_KEY` < 32 bytes. Generate:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```
Rotation invalidates all tokens.

### JWT diagnostic loaders
`backend/app/extensions.py` registers `expired_token_loader` / `invalid_token_loader` / `unauthorized_loader` / `revoked_token_loader`. Every 401 logs `jwt expired|invalid|missing|revoked: reason=... path=...`, returns JSON `{error, code, detail?}`.

### Eventlet greenlets + Flask app context
DB calls in greenlets fail "Working outside of application context." Fetch in main handler before `eventlet.spawn()`, OR wrap with `app.app_context()`.

### Eventlet × asyncio collision (bot AND scheduler must be separate processes)
Bot + scheduler use asyncio; eventlet's monkey-patched sockets break asyncio's selector. Run both as own systemd units. Reuse backend via `pip install -e ../backend` + `with flask_app.app_context():`.

### Bot AND scheduler dotenv must load before any `app.*` import
`app/config.py` reads `os.environ` at class-definition time. If `app.*` imports run before `load_dotenv()`, Config locks empty values → `401 Unauthorized` from OpenRouter. Fix: `bot/bot/__init__.py` + `scheduler/scheduler/__init__.py` call `load_dotenv(<dir>/'.env', override=True)` BEFORE `from app import create_app`. Don't reorder.

### Bot AND scheduler tests need `setuptools<81`
`mongomock` does `import pkg_resources`. After `uv pip install`: `uv pip install "setuptools<81"`. Same for backend tests.

### `tzdata` required on Windows for routines TZ
`zoneinfo.ZoneInfo('America/Los_Angeles')` raises `ZoneInfoNotFoundError` without `tzdata`. In `backend/requirements.txt` + `scheduler/pyproject.toml`.

### APScheduler MongoDBJobStore pickles callable by import path
Register job as string `'scheduler.executor:run_routine'`, NOT function reference. MongoDBJobStore stores import path. Collection `routines_apscheduler` distinct from `routines`.

### Scheduler reload uses HTTP push, not Mongo change streams
Local Mongo standalone (no replica set). Backend → scheduler = HTTP POST `/internal/reload` + 30s reconcile-poll fallback. `app/utils/scheduler_client.py` swallows connection errors.

### Two backends competing on :5000 (dev)
Main repo + worktree both bind :5000 via SO_REUSEADDR. OS load-balances → 404s on new routes. Diagnose: `netstat -ano | grep :5000.*LISTENING`, `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, kill stale.

### Pyright workspace doesn't auto-discover `bot/.venv-uv`
False-positive `reportMissingImports` for `bot/`. Configure `python.analysis.extraPaths` to include `bot/.venv-uv/Lib/site-packages` + `backend/.venv-uv/Lib/site-packages`, or add `bot/pyrightconfig.json`.

### `LLMConfigModel` method is `find_by_owner` (not `find_by_user`)
Signature: `find_by_owner(owner_id, skip=0, limit=50)`.

### Workflow seed templates: aiAgent key is `user_prompt_template` (snake_case)
`createNodeData` reads `userPromptTemplate || user_prompt_template`; `prepareNodesForSave` writes snake_case; backend executor reads snake_case. Templates with `'userPrompt': '<actual content>'` silently lose the content (frontend default falls back to `{{input}}`). Always use `'user_prompt_template'` in `seed.py`.

### `KnowledgeItemModel.find_by_user(user_id, folder_id=..., limit=...)` — no `find_by_folder`
Despite the naming, folder-scoped queries go through `find_by_user` with the `folder_id` kwarg.

### `OpenRouterService.generate_image()` has no size / aspect_ratio param
Workflow imageGen passes aspect-ratio + style preset as prompt suffix in `workflow_service.py` via `_ASPECT_PROMPT_HINTS` / `_IMAGE_STYLE_SUFFIXES`. When/if OpenRouter exposes a native size arg, swap to it.

### `/api/knowledge` POST: `source_type='workflow'` has its own required fields
`workflow_id` (ObjectId) + `node_id` (string), no `source_id` / `message_id`. Other source types (chat/arena/debate) still require `source_id` + `message_id` as ObjectIds. Image/audio/video outputs from workflow nodes save a text pointer, not the data URI.

### `POST /api/conversations` requires non-null `config_id`
Pass a real config id, or fall back to `'quick:google/gemini-2.5-flash-lite'` — `config_resolver.py` resolves the `quick:` prefix server-side.

### `frontend/src/constants/platformPresets.js` is an OBJECT keyed by id
`{ instagram, twitter, linkedin, tiktok, youtube_description }`. NOT an array. Backend `workflow_service.py:PLATFORM_LIMITS` uses identical keys — keep them in sync (already drifted once: `youtube` vs `youtube_description`).

### ChatInput accepts `initialMessage`; ChatPage reads `chat_prefill_<conversationId>` from sessionStorage
Workflow OutputActionBar's "Open in Chat" stores the prefill, navigates, then ChatPage reads + clears the key on mount. Reuse this pattern for any "open in chat" action.

### Pyright noise (ObjectId import, utcnow, `_get_current_object`, Generator indexing)
Project-wide existing patterns; not bugs. Don't reformat unless build or tests fail.

### react-resizable-panels v4 import names
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
`/videos/{id}/content?index=0` returns 401 without `Authorization`. Reuse poll headers — see `OpenRouterService.generate_video()`. Completed jobs purged quickly; failure → re-run + re-bill.

### OpenRouter image-gen model IDs drift
Hardcoded IDs return `404 Not Found for url: /api/v1/chat/completions`. Verify:
```bash
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  "https://openrouter.ai/api/v1/models" | \
  jq '.data[] | select(.architecture.output_modalities[]? == "image") | .id'
```

Live (verified 2026-04-25): `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `openai/gpt-5.4-image-2`.

When refreshing, update ALL of:
- `backend/app/services/openrouter_service.py` — `IMAGE_GENERATION_MODELS`, `IMAGE_GENERATION_LIMITS`, `get_image_capable_models()`
- `backend/app/routes/workflow_ai.py` — system prompt + fallback
- `backend/scripts/seed.py` — 35 imageGen template nodes
- `frontend/src/components/workflow/ImageGenNode.jsx` — `MODELS`
- `frontend/src/pages/workflow/hooks/useWorkflowState.js` — default
- Patch saved DB workflows:
  ```js
  db.workflows.updateMany(
    {'nodes.data.model': '<old-id>'},
    {$set: {'nodes.$[n].data.model': '<new-id>'}},
    {arrayFilters: [{'n.data.model': '<old-id>'}]}
  )
  ```
- Re-run `python scripts/seed.py --workflows`.

### MongoDB Atlas connection string
Missing DB name yields `'NoneType' object is not subscriptable`. Correct:
```
mongodb+srv://user:pass@cluster.mongodb.net/unichat?retryWrites=true&w=majority
```

### Bot + scheduler project switching (Phase 6)
Bot has per-user active project via `users.telegram_active_project_id` (lazy field, set by `/project` callback, cleared by `/unlink`). `/project` lists user's projects across all active workspace memberships. Picking a project resets `telegram_active_config_id` + `telegram_active_conversation_id` so context doesn't bleed across scopes. `/model` + `/assistant` use `LLMConfigModel.find_visible_to(uid, project_id=<active>)`. `bot/services/chat.py:prepare_request` passes the active project into `resolve_config`.

Scheduler: `routines.project_id` (ObjectId | None). `POST /api/routines/create` + `PUT /api/routines/<id>` accept it; `check_project_access(uid, pid, 'viewer')` gates create/update. `GET /api/routines/list?project_id=<hex>|__personal__` filters; absent = all. Executor (`scheduler/scheduler/executor.py`) re-checks access at fire time, raises `RuntimeError('project_access_revoked')` if user lost access. Workflow scope must match: routine.project_id == workflow.project_id when workflow is project-scoped.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind, React Query, Socket.IO, React Flow, CodeMirror 6, Lucide, react-resizable-panels v4, shadcn/ui, Motion (Framer Motion).
- **3D / animations**: three, `@react-three/fiber@8`, `@react-three/drei@9`, `@lottiefiles/dotlottie-react`.
- **Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet, Gunicorn.
- **Bot**: aiogram v3, aiohttp, pydantic-settings, markdown-it-py.
- **Scheduler**: APScheduler 3 `AsyncIOScheduler` + `MongoDBJobStore`, aiohttp, aiogram (delivery), croniter, tzdata.
- **DB**: MongoDB Atlas (prod), local Mongo (dev).
- **AI**: OpenRouter API.
- **Deploy**: Vercel (frontend), Ubuntu + Nginx + systemd (backend + bot + scheduler — separate units), GitHub Actions.

---

## UI Library

shadcn/ui in `frontend/src/components/ui/`:
```jsx
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
```
Path alias `@/` in `vite.config.js` + `jsconfig.json`. Motion presets in `frontend/src/utils/animations.js` (`buttonVariants`, `iconButtonVariants`, `fadeInUp`, `fastTransition`). Wrap icon buttons in `<Tooltip>`.

---

## Testing

```bash
cd backend
uv venv .venv-uv --python 3.12
uv pip install -r requirements.txt -r requirements-test.txt
```

```bash
cd backend
./.venv-uv/Scripts/python.exe -m pytest          # all
./.venv-uv/Scripts/python.exe -m pytest -v       # verbose
./.venv-uv/Scripts/python.exe -m pytest --cov=app # coverage
```

- `.venv-uv/` (not `.venv/`) avoids Windows lock issue.
- Standalone `bson` shadows `pymongo`'s bson — never `pip install bson`.

Test DB: `mongodb://localhost:27017/unichat_test`.
