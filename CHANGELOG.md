# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

## [3.0.0] — 2026-04-27

### Added — Telegram Bot Gateway

Linked uni-chat users can now chat with the platform from inside Telegram (text only, v1).

- **New `bot/` service** — separate `aiogram v3` process that reuses backend models/services via `pip install -e ../backend`, sharing MongoDB and OpenRouter. Polling in dev (`POLLING=1`), webhook in prod.
- **Linking flow** — Settings → Telegram tab → "Link Telegram" mints a one-time token (10-min TTL), opens `t.me/<TELEGRAM_BOT_USERNAME>?start=<token>`, bot consumes and binds `users.telegram_id` (unique sparse index).
- **Slash commands** — `/start`, `/new`, `/model`, `/assistant`, `/history`, `/unlink`, `/help`. Inline keyboards for model and assistant pickers (5 quick models + up to 10 saved assistants).
- **Streaming** — adaptive edit-in-place into the Telegram message (buffer ≥80 chars OR ≥1.2s since last edit). Markdown → Telegram-HTML allowlist (`<b><i><code><pre><a><blockquote>`). Splits at 4000 chars to stay under Telegram's 4096 cap.
- **Rate limit** — sliding window persisted on `users.telegram_rate_limit` (20 msg/60s, bypassed for `ADMIN_EMAIL`).
- **State** — `telegram_active_conversation_id`, `telegram_active_config_id`, `telegram_rate_limit`. Telegram chats are real `conversations` with `title='Telegram chat'`, visible immediately in the web app.

### Added — Backend

- `backend/app/models/telegram_link_token.py` — `TelegramLinkTokenModel` with TTL index on `expires_at` and atomic find-and-delete consume.
- `backend/app/routes/telegram_link.py` — `/api/users/telegram/{status,generate-token,unlink}`.
- `UserModel.find_by_telegram_id` / `set_telegram_link` / `clear_telegram_link` + unique sparse index on `telegram_id`.
- `backend/pyproject.toml` so the bot venv can `pip install -e ../backend`.
- **JWT diagnostic loaders** — `expired/invalid/missing/revoked` token callbacks log structured lines and return JSON `{error, code, detail?}`. Frontend interceptor only checks status, so the response shape is forward-compatible.
- **JWT secret key length** — placeholders in `.env.example` are now ≥32 bytes (RFC 7518 / PyJWT 2.10+ `InsecureKeyLengthWarning`).

### Added — Frontend

- `frontend/src/services/telegramService.js` — REST client for the link endpoints.
- `frontend/src/pages/dashboard/components/TelegramLinkPanel.jsx` — status panel, "Link Telegram" button, post-link polling, unlink action.
- New **Telegram** tab in `SettingsPage.jsx`.

### Added — Deploy

- `deploy/unichat-bot.service` — systemd unit for the bot.
- `deploy/nginx-telegram.conf` — webhook proxy snippet to merge into the existing API server block.
- `.github/workflows/deploy-bot.yml` — auto-deploy on push to `main` when `bot/**` or `backend/**` changes.

### Changed

- `CLAUDE.md` — top-level "Run (3 terminals)" section, bot architecture and feature notes, dev MongoDB path (`D:\MongoDB\data`) and recovery hint, two new Known Issues entries (bot dotenv ordering, `setuptools<81` for `mongomock`).
- Domain references replaced with `your-domain.example` placeholders in `frontend/vercel.json`, `bot/.env.example`, `bot/README.md`, `deploy/nginx-telegram.conf`. Update before redeploying.

### Fixed

- **Bot 401 from OpenRouter** — backend's `Config` class evaluates `os.environ` at class-definition time. Loading `bot/.env` from `bot/flask_ctx.py` was too late: handlers' `from app.models...` imports already ran the Config class with empty values, locking `OPENROUTER_API_KEY=''`. Moved `load_dotenv(override=True)` into `bot/bot/__init__.py` so it runs before any `app.*` import.
- **Silent bot failures** — chat handler now propagates OpenRouter error chunks to the user (`Error: <code>: <message>`) and edits the placeholder with "empty response from model" if the stream yields nothing, instead of leaving a stuck "…".

### Breaking

- `MONGO_URI` must include the database name before query params (e.g. `mongodb+srv://.../unichat?retryWrites=true&w=majority`). Missing DB name yields `'NoneType' object is not subscriptable`. Documented in Known Issues.
- The previous `sepijan.xyz` domain is no longer owned. Production deploys require updating placeholder URLs in `vercel.json`, bot env, nginx snippet, and webhook URL before redeploy.

### Database

New collection: `telegram_link_tokens` (TTL on `expires_at`).
New fields on `users`: `telegram_id`, `telegram_username`, `telegram_linked_at`, `telegram_active_conversation_id`, `telegram_active_config_id`, `telegram_rate_limit`.

---

## [2.8.0] and earlier

See `git log v2.8.0` for prior history (workflow editor overhaul, automate agent via browser-use Cloud, knowledge vault, debate mode, code canvas, image generation, etc.).
