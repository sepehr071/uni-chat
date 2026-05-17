# CLAUDE.md

Full-stack AI chat: Flask backend + React frontend + OpenRouter. Streaming chat, image gen, workflow editor, arena, debate, knowledge vault, Telegram bot, routines scheduler.

## Skill auto-fire on this repo (mandatory check)
- Mongo / scoping / DLP / workspace-permissions question → `mcp__serena__find_symbol` first
- React component / Tailwind / RTL / i18n UI → `frontend-design` or `impeccable`
- Library question (React Flow, aiogram, APScheduler, eventlet, etc.) → `context7` mandatory
- Multi-file feature → `superpowers:writing-plans` BEFORE code
- Backend bug / 500 / socket disconnect / "doesn't work" → `superpowers:systematic-debugging`
- Multi-file refactor → `orchestrator` agent (already configured)
- Backend-only / frontend-only edits → `backend-agent` / `frontend-agent`
- TDD: Flask blueprints + sockets → `superpowers:test-driven-development`
- Reviewing diff / PR → `caveman:caveman-review` or `security-review`
- "data lost / history gone after restart" complaint → query Mongo directly FIRST via `pymongo` one-liner; do NOT assume UI scoping until prod row counts confirm whether data exists.

## Search order on this repo (Grep is last resort)
1. Read serena memory `architecture/symbol-cheatsheet` for the canonical file path
2. `mcp__serena__find_symbol "ClassName" relative_path="backend/app"` — Python only, LSP-backed
3. `mcp__serena__find_referencing_symbols` — caller chains
4. **Glob** for filename (`**/*Page.jsx`, `**/migrate_*.py`)
5. **Grep** with filters: `type:"py"|"jsx"`, `head_limit:50`, `-n:true`, `multiline:true` for cross-line patterns
6. **ast-grep** for structural queries (e.g. "all `aiAgent` nodes missing `user_prompt_template`", "all routes missing `@jwt_required`")
7. **Explore agent** when uncertain scope or multi-round expected

`.ripgrepignore` at repo root excludes venvs, dist, build, lock files, locale-source JSONs, deploy archives. Layers on top of `.gitignore`.

## Run (4 terminals)

```bash
cd backend   && ./.venv-uv/Scripts/python.exe run.py            # :5000
cd frontend  && npm run dev                                      # :3000
cd bot       && POLLING=1 ./.venv-uv/Scripts/python.exe -m bot.main
cd scheduler && ./.venv-uv/Scripts/python.exe -m scheduler.main  # :8082
```

Local MongoDB on `:27017`. Each service loads own `.env` — see service-level `.env.example` / source for required vars.

## Quick Reference

| Task | Command |
|------|---------|
| Backend env (one-time) | `cd backend && uv venv .venv-uv --python 3.12 && uv pip install -r requirements.txt -r requirements-test.txt && uv pip install "setuptools<81"` |
| Frontend build | `cd frontend && npm run build` |
| Backend tests | `cd backend && ./.venv-uv/Scripts/python.exe -m pytest [-v] [--cov=app]` |
| Meetings tests only | `cd backend && ./.venv-uv/Scripts/python.exe -m pytest tests/ -k meetings -v` |
| Bot / scheduler env | same pattern, `cd <svc> && uv venv .venv-uv --python 3.12 && uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt && uv pip install "setuptools<81"` |
| Seed templates | `cd backend && python scripts/seed.py [--workflows]` |
| Seed holding demo | `cd backend && ./.venv-uv/Scripts/python.exe scripts/seed_holding.py [--reset\|--wipe]` |
| Migrations | `scripts/migrate_{workspaces,projects,resource_scoping,collapse_roles}.py [--dry-run]` |

Test DB: `mongodb://localhost:27017/unichat_test`. Use `.venv-uv/` (not `.venv/`) — Windows lock issue. Never `pip install bson` (shadows pymongo's).

---

## Architecture

```
backend/app/
├── models/   routes/   services/   sockets/   utils/
frontend/src/
├── constants/  context/  services/  pages/  components/   # @/ → src/
bot/bot/        # aiogram v3 — handlers/, services/, flask_ctx.py
scheduler/scheduler/   # APScheduler + aiohttp + flask_ctx.py
```

`bot/` + `scheduler/` reuse backend via `pip install -e ../backend`, separate `.venv-uv` each.

---

## Features

- **Chat & Arena** — Socket.IO streaming. Arena = 2–4 configs in parallel via eventlet greenlets. Auto-title via `gemini-2.5-flash-lite`. Branching, vision, export.
- **Image Studio** (`/image-studio`) — text-to-image + image-to-image. Models: Gemini 2.5/3.1 Flash + 3 Pro images, GPT-5 image variants. IDs drift — see Known Issues.
- **Workflow Editor** (`/workflow`) — React Flow. Executable nodes: `imageUpload`, `imageGen`, `textInput`, `aiAgent`, `ttsNode`, `videoGenNode` (internal type strings — never rename). Marketer-facing labels: Copywriter / Image / Voiceover / Video / Brief / Reference Image. Topological exec, 5s debounced auto-save, 23 templates (`seed.py --workflows`). SMM extras: Copywriter `variants`/`platform_preset`/`knowledge_folder_id` (brand brief), Image `aspect_ratio`+`style_preset` injected as prompt suffix. **Showcase node types** (UI-only, 12 total across MARKETING / DEV / AUTOMATION NodeRail categories): `personaBuilderNode`, `seoBriefNode`, `hashtagPackNode`, `audienceMatchNode`, `apiCallNode`, `jsonTransformNode`, `codeRunnerNode`, `gitActionNode`, `webhookTriggerNode`, `cronScheduleNode`, `branchConditionNode`, `httpRequestNode`. `SHOWCASE_NODE_TYPES` frozenset in `workflow_service.py` short-circuits with `NotImplementedError('workflow.showcaseNodeNotImplemented: <label>')` BEFORE dispatch; DLP static-scan loop explicitly `continue`s past them.
- **Automate Agent** (`/automate-agent`) — NL browser automation via browser-use Cloud. Auth header: `X-Browser-Use-API-Key` (NOT Bearer). SSE 2s poll, 30min cap.
- **Debate** (`/debate`) — 2–5 LLMs, rounds (0=infinite cap 20), judge verdict, `[DEBATE_CONCLUDED]` marker stripped.
- **Quick Models** — 5 defaults prefixed `quick:` in `frontend/src/constants/models.js`, resolved by `utils/config_resolver.py`. No custom assistant needed.
- **Knowledge Vault** (`/knowledge`) — bookmark AI responses; folders, tags, search. Workflow non-text outputs save text-pointer (`[Image] <url>`), not data URI.
- **AI Preferences** (Settings) — name/lang/expertise/tone/style/custom (≤2000 chars) on `user.ai_preferences`, injected via `OpenRouterService.build_enhanced_system_prompt()`.
- **Telegram Bot** — separate aiogram v3 process. Polling dev / webhook prod. Linking via 10-min token. Commands: `/start /new /model /assistant /project /history /unlink /help`. Adaptive edit-in-place streaming. Per-user state on `users.telegram_*`.
- **Routines** (`/routines`) — cron-scheduled LLM tasks. Actions: chat prompt | workflow. Outputs: chat | knowledge folder | Telegram DM. Per-user IANA TZ (needs `tzdata` on Windows). Limits: 20 active, retry 1× +60s, history capped 50. APScheduler `AsyncIOScheduler` + `MongoDBJobStore('routines_apscheduler')` on `:8082`. Backend pushes via HTTP POST `/internal/reload` + 30s reconcile-poll fallback.
- **Meetings** (`/meetings`, `/meeting-series`) — ported from standalone `meeting-assistant`. Personal-scope v1 (no `workspace_id`/`project_id`; mirrors bot/routines v1). Three ingest modes: upload (mp3/wav/m4a/webm/ogg, ≤500MB), mic record (`getUserMedia` + MediaRecorder Opus 64kbps), tab capture (`getDisplayMedia` w/ optional mic mix). Batch diarization via **ElevenLabs Scribe v2** (`language_code='fas'`, `diarize=True`, word timestamps) — no live captions. Seven summary artifacts via OpenRouterService strict `json_schema` w/ model **hard-locked server-side to `google/gemini-3-flash-preview`** (mirrors helper/DLP pattern): `exec_summary`, `action_items`, `decisions`, `qa`, `open_questions`, `email_draft` (formal/casual tone), `speaker_names`. **`minutes` is server-built** from diarized words (not LLM-generated; avoids output-token truncation on 1h+ meetings). Recurring **series** (`/meeting-series`) bind related meetings for shared glossary (manual/suggested/accepted keyterms fed to Scribe, max 1000×50char) + speaker-name memory + email-tone preference. Fuzzy series suggester via `rapidfuzz.token_sort_ratio` ≥85. **State machine** `uploaded → transcribing → summarizing → done | failed` on `meetings.status`; pipeline runs as a `threading.Thread` daemon (re-enters captured `app.app_context()`; single-process Flask). **Cancel** = sync flip status + `threading.Event` signal at safe boundaries (process-local; multi-worker would need DB-flag poll). **Regenerate** = re-runs LLM only, keeps transcript. **SSE status** at `GET /api/meetings/<id>/stream` — 1s poll loop, `phase_change`/`*_complete`/`error` events, `:keepalive` every 15s. **Frontend SSE consumer uses `fetch` + `ReadableStream` (NOT `EventSource`)** since `EventSource` cannot send `Authorization: Bearer` header. **500MB upload bypasses Flask's global `MAX_CONTENT_LENGTH=16MB`** via per-request override (`request.max_content_length = MEETING_MAX_AUDIO_BYTES`) — keep global cap unchanged. **"Discuss this meeting"** spawns a uni-chat `conversations` doc seeded with a `role='system'` MessageModel containing transcript + all 7 artifacts; uses `config_id=f'quick:{MEETING_DISCUSSION_MODEL}'`. **Save artifact → Knowledge** auto-creates a folder named after the meeting on first save; `KnowledgeItemModel.create(source_type='meeting', source_id=mid, ...)` where `meeting_id` is stored as a **UUID4 STRING (NOT ObjectId)** — `meetings`/`meeting_series`/`meeting_series_keyterms`/`meeting_series_speaker_names` all use UUID4 string `_id` to mirror upstream cross-system refs. **Critical Mongo index gotcha**: `meetings.title` text index MUST be created with `default_language='none'` + `language_override='_no_lang_'` — Mongo ships no Persian stemmer and `language='fas'` would fail every insert otherwise. Owner-scoping: every read/write filters by `owner_id`; cross-user returns 404 (not 403, mirrors `uploads.py` no-existence-oracle). Cost attribution: `OpenRouterService._sync_completion(..., origin='meeting', feature='meeting', workspace_id=None, project_id=None)`. DLP gate called with `source='meeting'` after transcription + per artifact — no-op for `workspace_id=None` but called for v2 forward-compat. Feature flag: `meetings` (default `false`). Requires `ELEVENLABS_API_KEY` in `backend/.env`. Requires `ffprobe` on PATH for duration probe (failure → `duration_s=None`, meeting still proceeds). `helper_features.py` route inventory entries: `/meetings`, `/meetings/<id>`, `/meeting-series`.
- **i18n + RTL** — `react-i18next` + `i18next-browser-languagedetector`. 16 namespaces auto-discovered via `import.meta.glob('./locales/**/*.json')` — drop a JSON, it registers. Persian flips RTL via `LanguageContext`. Use **logical Tailwind classes** (`ps/pe/ms/me/start/end/border-s/-e/text-start/-end`) over physical. Date wrappers in `utils/dateLocale.js` — never call `date-fns format()` directly. LTR-locked inputs (code editors, model IDs, JSON, URLs) need `dir="ltr"`.
- **Code Canvas** (in chat) — Run button on HTML/CSS/JS blocks → resizable side panel + iframe (`srcdoc` + `sandbox="allow-scripts"`, NO `allow-same-origin`). Slash `/canvas` still active (auto-opens panel post-stream via `agent:canvas` synthetic config). Public share + MyCanvases surfaces REMOVED — no `shared_canvases` collection, no `/canvas/:shareId` route, no ShareDialog. Feature flag `code_canvas_run` only (no `code_canvas_share`).
- **Helper Assistant** — persistent global right-rail (`components/helper/HelperRail.jsx`) mounted in `MainLayout.jsx`. Defaults open on `/chat` + `/knowledge`, collapsed (icon strip) on `/workflow` + `/arena` + `/debate`; per-user persistence in `localStorage.unichat:helper-rail:<userId>`. Auto-suppresses when chat Focus Mode or Code Canvas panel is open. Read-only guide — outputs markdown deep-links (`[label](/route)`) rendered as `<Link>` via `HelperDeepLink`, never auto-navigates. Backend: `POST /api/helper/stream` (SSE), `/cancel/<id>`, `/clear`, `/history`. Model hard-locked server-side to `google/gemini-3.1-flash-lite` (mirrors DLP smart-scan). Per-user 30 req/60s rate-limit on `/stream` only. Prompt built at request time from `UserModel.get_ai_preferences()` + active workspace/project/member_role + page route + `prompts/helper_features.py` FEATURES catalog (role-filtered). **`helper_features.py` is the route-inventory source of truth — when adding a new authenticated route in `App.jsx`, also extend this file or the helper won't suggest it.** History persisted in `helper_conversations` collection (single doc/user, atomic `$push`, rolling-30 window sent to model, full retained for UX). DLP via shared `dlp_gate(source='helper')` server-side + pre-flight scan in `HelperInput.jsx` mirroring chat composer pattern. Usage attributed with `origin='helper'`.
- **Toasts** — `react-hot-toast` v2, mounted ONCE in `frontend/src/main.jsx` via `<Toaster position="top-center">{(t) => <Toast t={t}/>}</Toaster>` render prop. All visuals owned by `frontend/src/components/ui/Toast.jsx` (variants by `t.type`: `success | error | loading | blank`). Call sites stay vanilla `toast.success(...)` / `toast.error(...)` / `toast.loading(...)` — never style at the call site, never re-mount `<Toaster>` elsewhere. Use project tokens (`bg-background-elevated`, `bg-success/15 text-success`), not arbitrary OKLCH.
- **Holding model** — CEO (`user.role='admin'`) → Managers (`user.role='manager'`) → Companies (team workspaces) → Projects → Folders → Chats. **UI says "Company"; DB uses `workspace*`** (never rename DB identifiers, services, contexts, hooks). Member-role enum is **`owner | editor | viewer`** (3 roles only — legacy `guest`/`billing-admin`/per-workspace `admin` were collapsed; deprecation shim in `permissions.py` maps legacy DB rows for one transition release). Only `admin`+`manager` can `POST /workspaces/create` (gated by `@manager_or_admin_required` in `app/utils/decorators.py`). Global `admin` is super-admin: `permissions.check_workspace_access`/`check_project_access` short-circuit `True` for `user.role='admin'` so admin sees + does anything across the holding without explicit membership. Auto-personal-workspace on signup is unchanged. `OnboardingWizard` (`/onboarding`) auto-redirects new managers/admins until completion (`localStorage.onboarding_complete:<userId>` flag).
- **Two admin role strings, not synonymous** — `user.role='admin'` = in-app super-admin (sees `/admin/*` + sidebar Holding-admin section, gated by `<ProtectedRoute adminOnly>`). `user.role='platform_admin'` = platform operator above CEO (sees `/platform/*` via `<PlatformLayout>`, gated by `<ProtectedRoute platformAdminOnly>`). Every gate uses literal string match. `routes/auth.py:140` sets `role='platform_admin'` for `platform_admins` collection hits (separate from `users`). `ProtectedRoute` auto-bounces platform admins away from non-platform routes to `/platform/holding`.
- **Feature flag wiring** — adding/gating a `platform_settings.features.<name>` flag means touching all four: (1) `backend/app/models/platform_settings.py:DEFAULT_FEATURES`, (2) `frontend/src/utils/featureFlags.js:FEATURE_FLAG_KEYS`, (3) sidebar item in `Sidebar.jsx` tagged with `feature:'<name>'` (filtered via `hasFeature(user, feature)`), (4) route in `App.jsx` wrapped in `<FeatureGate feature="<name>">`. `/auth/me` + `/auth/login` populate `user.features`. Backend `@feature_required('<name>')` is the server-side mirror. Flags are snapshotted at login — toggling at `/platform/features` requires regular users to reload before the change is visible.
- **Workspaces + Projects** (`/projects`) — Resource scoping on `LLMConfig`/`Workflow`/`KnowledgeFolder`/`KnowledgeItem` via `project_id` + `workspace_id`. Decorators: `@workspace_member` / `@project_role` (`app/utils/decorators.py`). Routes return FLAT JSON; `cannot_reassign_project` → use `/move`. Bot + scheduler are personal-scope only in v1 (per-user active project state on `users.telegram_active_project_id` / `routines.project_id`). Endpoints worth knowing: `POST /workspaces/<wid>/transfer-ownership` (atomic owner swap, owner+CEO only), `POST /workspaces/<wid>/invites/<token>/resend` (rotates token + extends 7d TTL, also tries SMTP via `services/email_service.py` → response `{ ..., email_sent: bool }`). Sidebar splits into: **Company pill** (`WorkspaceSwitcher`) + **ProjectSwitcher** + pinned projects + persistent **"Holding admin"** section visible only when `user.role='admin'`. Slim settings: Company Settings = 6 tabs (General | Members | Billing | Activity | Content Safety | Danger), Project Settings = 4 tabs (General | Members | Defaults | Danger). **Auth scoping cleanup**: `AuthContext.logout` and `services/api.js` 401-refresh-failure path MUST clear `localStorage.active_workspace_id` + every `active_project_id::*` key + call `queryClient.clear()`. `WorkspaceContext` + `ProjectContext` self-heal: stored ID not in fetched list → `localStorage.removeItem`. Never send literal `'null'` string as `project_id` query param — backend strict-matches `{project_id: null}`; omit the param when no project is active (covers `/conversations`, dashboard recents, history page).
- **Super-admin holding view** (`/admin/companies` + `/admin/companies/:wid`) — `@admin_required`. Cross-company table with member/project/conversation counts + `usage_logs` cost rollup over `?days=` window + per-company drill-down (top users, top models, per-project usage). Backend: `app/routes/admin.py`. Frontend: `pages/admin/CompaniesPage.jsx` + `CompanyDetailPage.jsx`. `/admin/dlp` is the parallel DLP-events dashboard.
- **DLP / Content Safety** — workspace-scoped scanner. 18 builtin rules (API keys, PII, internal IDs). Severity → action (`critical→block`, `high→require_confirm`, `medium/low→warn`). Sensitivity tiers `lenient|balanced(default)|strict`. Chokepoints: chat_stream, arena_stream, `WorkflowService.execute_workflow` (static scan over `textInput.text` + `aiAgent.user_prompt_template` only). Pre-flight `POST /api/dlp/scan` (60/min in-mem rate-limit). `block` is non-overridable; `dlp_confirmed=true` honoured for `require_confirm` only. Raw text never persisted (only `text_sha256` + masked snippets). **Chat composer wires pre-flight scan + `DLPViolationModal` (`components/dlp/DLPViolationModal.jsx`) for warn / require_confirm / block; Modify restores text+files via `<ChatInput key initialFiles>` remount; Send-anyway disabled on block.** Match payload carries `description` (human reason) + `source` (`builtin|custom|hostname|llm`); per-rule i18n at `dlp:rules.<rule_id>.{name,reason}` (en+fa). LLM smart-scan model is **hard-locked** to `google/gemini-3.1-flash-lite` server-side (UI has no model field; client value silently overwritten in `_validate_llm_classifier`). Owner-only test playground `POST /api/dlp/test` (no rate-limit, no event persistence). Per-workspace policy editable at Company Settings → Content Safety tab (`DLPPolicyTab.jsx`); admin global view at `/admin/dlp`.
- **Landing** (`/`) — public; logged-in users redirect to `/chat`. Three.js particles + dotLottie hero.
- **Cost & usage tracking** — `OpenRouterService._record_usage` is the SOLE authoritative writer to `usage_logs`. Every LLM call site (`chat_completion`, `generate_image`, `generate_speech`, `generate_video`) MUST pass `workspace_id`+`project_id`+`origin` kwargs for rollup attribution; bot v1 = personal-scope (`workspace_id=None`, `origin='telegram'`), scheduler routines = `project_id=routine.project_id`+`origin='routine'`, helper rail = `origin='helper'`, meetings = personal-scope (`workspace_id=None`, `origin='meeting'`, `feature='meeting'`). `origin` is a free-form string (not enumerated); known values: `web`, `telegram`, `routine`, `helper`, `meeting`. NEVER call `UsageLogModel.create` directly from routes (double-write inflates cost ~2×). Always trust OpenRouter's `usage.cost` (already includes prompt+completion+cache+reasoning+image+web-search) — local pricing table is last-resort fallback. `cached_tokens` is SUBSET of `prompt_tokens`, not additive. `credit_ledger` is MANUAL top-ups only; `Workspace.credits_balance_usd` = lifetime topups (never decrements). Compute remaining live as `sum(ledger) - sum(usage_logs.cost_usd WHERE workspace_id=wid)` — see `/workspaces/<wid>/billing/usage` response `credits` block. Frontend cost formatters use `min=2 max=4` decimals to surface sub-cent usage. **`$` figures owner-only** — Billing tab is the single surface; ContextRail/WorkspaceOverview do not show cost. Use shared `frontend/src/components/ui/CostValue.jsx` — never redefine `formatUSD` etc. Backend `/billing/usage` is `min_role='owner'`.

---

## Database (MongoDB)

Collections: `users`, `conversations`, `messages`, `llm_configs`, `folders`, `usage_logs`, `audit_logs`, `generated_images`, `arena_sessions/messages`, `workflows`, `workflow_runs`, `helper_conversations`, `knowledge_items/folders`, `debate_sessions/messages`, `automate_tasks/messages`, `telegram_link_tokens`, `routines`, `routine_runs`, `routines_apscheduler` (separate from `routines`), `workspaces`, `workspace_members/invites`, `projects`, `project_members`, `dlp_events`, `credit_ledger`, `groups`, `group_members`, `project_group_access`, `meetings`, `meeting_transcripts` (1:1 w/ meeting, separate to dodge 16MB cap on large `words_json`), `meeting_summaries` (multi per regenerate), `meeting_series`, `meeting_series_keyterms`, `meeting_series_speaker_names` (meetings stack is personal-scope v1 — no `project_id`/`workspace_id` fields; `meetings._id`/`meeting_series._id`/keyterm `_id`/speaker-name `_id` are UUID4 STRINGS, not ObjectId). Removed in v2-rework: `shared_canvases` (canvas share surface dropped), `users.saved_configs[]` (community gallery dropped).

**Scoping**: `conversations`/`folders` carry `project_id`. `llm_configs`/`workflows`/`knowledge_*` carry `project_id` + `workspace_id`. `LLMConfig.visibility ∈ {private, public, template, project}`. `KnowledgeFolder` unique = `(scope_key, name)` where `scope_key = str(project_id) if project_id else f'u:{user_id}'`. Workspace owners = implicit project owners.

**`users.role`** enum: `'user' | 'manager' | 'admin'` (validated via `VALID_USER_ROLES` in `models/user.py`). Promote a user via the admin panel `PATCH /api/admin/users/<id> {"role":"manager"}` or `migrate_collapse_roles.py --promote-managers email1,email2`.

`MONGO_URI` MUST include DB name before query params: `mongodb+srv://.../unichat?retryWrites=true&w=majority` — missing name → `'NoneType' object is not subscriptable`.

Local dev: `C:\Program Files\MongoDB\Server\8.2\`. Service `MongoDB`.

---

## Common Patterns

- **Backend route**: Blueprint in `app/routes/<name>.py` → register in `app/__init__.py` → `@jwt_required()`. Avoid `/` root path (trailing-slash redirects drop JWT — use named subpaths). Team-scoped: `@workspace_member` / `@project_role`. Resolve project access in main socket handler BEFORE `eventlet.spawn()`.
- **Socket event**: `app/sockets/*_events.py`. DB ops in main handler, NOT greenlets (app-context errors).
- **Frontend page**: `src/pages/<Name>` → lazy import + Route in `App.jsx` → nav in `Sidebar.jsx`.
- **i18n string**: add key to `frontend/src/i18n/locales/{en,fa}/<ns>.json` (mirror tree) → `useTranslation('<ns>')` → `t('keyPath')`. Persian translation MUST accompany every English key.
- **i18n plurals**: i18next `count` rule — keys `foo_one` + `foo_other`, call `t('foo', { count: n })`. Never `n === 1 ? 'x' : 'xs'` in JSX.
- **i18n parity check**: `cd frontend && node -e "const fs=require('fs'),p=require('path'),en='src/i18n/locales/en',fa='src/i18n/locales/fa',f=o=>Object.keys(o).flatMap(k=>typeof o[k]=='object'&&o[k]?f(o[k]).map(s=>k+'.'+s):[k]);for(const x of fs.readdirSync(en))if(x.endsWith('.json')){const e=f(JSON.parse(fs.readFileSync(p.join(en,x))));const a=f(JSON.parse(fs.readFileSync(p.join(fa,x))));const m=e.filter(k=>!a.includes(k)),r=a.filter(k=>!e.includes(k));if(m.length||r.length)console.error(x,'miss-fa:',m,'extra-fa:',r)}"` — verifies en↔fa key parity. Pre-existing tolerated imbalance: `workflow.json` has extra fa key `workflowGenerator.errorGenerate` (don't "fix").
- **Directional Tailwind**: prefer logical classes; verify in فارسی via Settings → Preferences.
- **Tailwind colour tokens**: aliases in `tailwind.config.js` `extend.colors` need `<alpha-value>` placeholder or `/N` opacity silently fails. CSS var must be a triplet, not pre-wrapped `hsl()`.
- **`--shadow-color`**: consumed bare in `boxShadow`, must be valid CSS colour (rgba / hsl-wrapped) — bare HSL triplet invalid.
- **Refined palette light parity**: every `--bg-*/--fg-*/--ok/warn/err/violet/pink/teal/line*/role-*` token needs both `:root` AND `.dark` values, else silent transparent in light mode.
- **`WorkspaceSwitcher` route sync**: `setActiveWorkspace` alone leaves `wid` stale on `/workspaces/<wid>/*` + `/admin/companies/<wid>/*`. Use `switchTo(w)` to also navigate.

---

## Multi-Agent Development

| Scenario | Agent | Model |
|----------|-------|-------|
| Multi-file feature across stack | `orchestrator` | Opus |
| Backend-only | `backend-agent` | Sonnet |
| Frontend-only | `frontend-agent` | Sonnet |
| Complex refactor | `orchestrator` | Opus |
| Bug fix (known location) | direct | — |

Auto-commit per phase. Conventional Commits: `backend:` / `frontend:` / `feat:` / `fix:` / `refactor:`.

**Concurrent edits to a shared JSON** (multiple agents adding keys to the same `i18n/locales/<lang>/projects.json`, etc.): force surgical `Edit` with narrow old/new pairs targeting one key block at a time. Never `Write` the full file — clobbers concurrent teammate's edits. In each agent's prompt, name the sub-tree it owns (e.g. agent A → `workspaceSettings.*`, agent B → `workspacePage.*`).

---

## Serena MCP — read first

Project registered as `uni-chat` (`E:\Projects\uni-chat`). Activate via `mcp__serena__activate_project`. Prefer `mcp__serena__find_symbol` / `find_referencing_symbols` over Grep+Read.

Memories worth reading first: `architecture/i18n-rtl`, `features/workspaces-projects`, `features/routines-scheduler`, `features/bot-telegram`, `features/automate-agent`, `features/workflow-editor`, `dev/run`, `known_issues_and_gotchas`, `code_style_and_conventions`.

Record durable facts via `mcp__serena__write_memory`.

---

## Known Issues (top 7 — rest in Serena `known_issues_and_gotchas`)

### `pytest` MUST bind to `unichat_test` BEFORE `create_app()` (silent prod-wipe risk)
`Config.MONGO_URI` is read at class-def time, and `flask_pymongo.PyMongo.init_app()` binds the client immediately. Setting `app.config['MONGO_URI']` AFTER `create_app()` is a no-op — `mongo.db.name` stays `'unichat'`, and the per-test `db` fixture's `delete_many({})` cleanup wipes the **prod** dev database. Always set `os.environ['MONGO_URI']='mongodb://localhost:27017/unichat_test'` BEFORE any `from app import …` import in `tests/conftest.py`. Both `app` and `db` fixtures hard-assert `mongo.db.name == 'unichat_test'` and raise `RuntimeError` if not — never weaken or wrap that guard. When a user reports "data lost after restart", verify with: `./.venv-uv/Scripts/python.exe -c "from pymongo import MongoClient; db=MongoClient('mongodb://localhost:27017')['unichat']; [print(c, db[c].count_documents({})) for c in db.list_collection_names()]"`.

### `ADMIN_PASSWORD` validation + bcrypt-bytes
`backend/app/__init__.py:170-185` raises at boot if `ADMIN_PASSWORD` < 16 chars or in `{admin, admin123, changeme, password, password123}`. `ensure_default_admin` is **create-only** — env change does NOT rotate existing admin's hash. To rotate: edit `.env` AND re-hash with **bcrypt bytes** (NOT werkzeug — werkzeug strings break `bcrypt.checkpw`):
```python
import bcrypt; from app.models.user import UserModel
u = UserModel.find_by_email(os.environ['ADMIN_EMAIL'])
h = bcrypt.hashpw(os.environ['ADMIN_PASSWORD'].encode('utf-8'), bcrypt.gensalt())
UserModel.get_collection().update_one({'_id': u['_id']}, {'$set': {'password_hash': h}})
```

### Bot + scheduler dotenv ordering (silent 401)
`app/config.py` reads `os.environ` at class-definition time. `bot/bot/__init__.py` + `scheduler/scheduler/__init__.py` MUST `load_dotenv(<dir>/'.env', override=True)` BEFORE `from app import create_app`, else Config locks empty values → `401 Unauthorized` from OpenRouter. Don't reorder imports.

### Eventlet greenlets + Flask app context
DB calls inside `eventlet.spawn()` fail "Working outside of application context." Fetch in main handler before spawn, OR wrap with `app.app_context()`. Bot + scheduler use asyncio (collides with eventlet's monkey-patch) — **must run as separate processes**, reuse backend via `with flask_app.app_context():`.

### Two backends competing on `:5000` in dev
Main repo + worktree both bind via SO_REUSEADDR. OS load-balances → mystery 404s on new routes. Diagnose: `netstat -ano | findstr :5000.*LISTENING`, `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`, kill stale.

### CSS-var unwrapping in JS `style` props
Project HSL tokens (`--background-elevated`, `--foreground`, `--border`, `--accent`, etc.) and status RGB tokens (`--success`, `--warning`, `--error`) are **space-separated triplets**, not full color values. Consuming them in JS-string `style` / inline `iconTheme` / config props requires the wrapper: `'hsl(var(--foreground))'` / `'rgb(var(--success))'`. Bare `'var(--foreground)'` parses as invalid color → browser default → element looks unstyled (silent — no console error). This bit `<Toaster toastOptions.style>` invisibly. Tailwind's `tailwind.config.js` already wraps via `'hsl(var(--x))'` / `'rgb(var(--x) / <alpha-value>)'`, so prefer Tailwind classes (`bg-background-elevated`, `text-success`) over inline `style` whenever possible.

### Radix transform-driven primitives don't auto-mirror in RTL
Radix `Switch` thumb (and any Radix primitive that animates with `translate-x-N` / `-y-N` rather than `inset-inline-start/end`) does NOT mirror in `dir="rtl"`. No `DirectionProvider` is mounted in this app, so the primitive can't fix it for you. Result: knob slides off-track in Persian. Fix is to add the mirror Tailwind variant per state — Tailwind 3.3+ ships built-in `rtl:` so `rtl:-translate-x-N` works without a plugin. Confirmed at `frontend/src/components/ui/switch.jsx:28-42`. Same lesson applies to any inline transform tied to direction (drawers, popovers, sliders) — logical Tailwind classes alone don't cover JS-driven transforms.

### `useSyncExternalStore` requires new snapshot ref each mutation
`getSnapshot()` returning the same object reference makes React bail via `Object.is(prev, next)` — no re-render even though listeners fire. Module-level stores (e.g. `frontend/src/hooks/useHelperRail.js`) MUST swap the state object on every mutator (`state = { ...state, x: v }`), not mutate fields in place. Symptom: setter runs + emit() notifies subscribers, but consumer UI never updates. Bit the helper rail collapse button.

### OpenRouter image-gen model IDs drift
Hardcoded IDs return `404`. Verify via `curl https://openrouter.ai/api/v1/models | jq '.data[] | select(.architecture.output_modalities[]? == "image") | .id'`. Live (2026-04-25): `google/gemini-2.5-flash-image`, `google/gemini-3.1-flash-image-preview`, `google/gemini-3-pro-image-preview`, `openai/gpt-5-image-mini`, `openai/gpt-5-image`, `openai/gpt-5.4-image-2`. Frontend now consolidates around `useModelCatalog` — only **2 files** still ship hardcoded fallbacks (`pages/workflow/hooks/useWorkflowState.js` + `components/workflow/ImageGenNode.jsx`); both fall back to the catalog when present. Backend still needs manual updates in `services/openrouter_service.py` (3 dicts), `routes/workflow_ai.py`, `scripts/seed.py` (35 nodes); patch saved DB workflows via `db.workflows.updateMany` w/ arrayFilters, then re-run `seed.py --workflows`.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind 3.4, React Query, Socket.IO client, React Flow, CodeMirror 6, react-resizable-panels v4 (`Group/Panel/Separator/usePanelRef`, `orientation`/`panelRef`), shadcn/ui (`@/components/ui/*`), Motion, i18next, date-fns + `fa-IR` wrapper. 3D: three + `@react-three/fiber@8` + `@react-three/drei@9` (NOT v9 of fiber — needs React 19). Lottie via `@lottiefiles/dotlottie-react`.
- **Backend**: Flask, Flask-SocketIO, Flask-JWT-Extended (HS256, `JWT_SECRET_KEY` ≥ 32 bytes), PyMongo, Eventlet, Gunicorn (`gthread` for SSE).
- **Bot**: aiogram v3, aiohttp, pydantic-settings, markdown-it-py.
- **Scheduler**: APScheduler 3 `AsyncIOScheduler` + `MongoDBJobStore`, aiohttp, aiogram (delivery), croniter, tzdata.
- **AI**: OpenRouter. **DB**: MongoDB Atlas (prod) / local Mongo (dev). **Deploy**: Vercel (frontend) + Ubuntu/Nginx/systemd (backend + bot + scheduler — separate units) + GitHub Actions.
