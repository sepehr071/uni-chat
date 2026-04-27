# uni-chat

> One workspace for every model. Chat, debate, generate, automate — and chat from Telegram.

[![release](https://img.shields.io/github/v/release/sepehr071/uni-chat?label=release)](https://github.com/sepehr071/uni-chat/releases)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![python](https://img.shields.io/badge/python-3.12-blue.svg)](#stack)
[![node](https://img.shields.io/badge/node-18%2B-green.svg)](#stack)

uni-chat is a self-hosted multi-model AI workspace. One login, every model worth using, every workflow you'd actually run twice. Plug in an OpenRouter key and you get GPT-5, Claude 4.5, Gemini 3, Grok 4, and dozens more — plus a workflow canvas, side-by-side arena, multi-model debates, browser-use automation, image generation, and a Telegram gateway that lets you chat from your phone in seconds.

```bash
# Three terminals, one tool, full stack live
cd backend && ./.venv-uv/Scripts/python.exe run.py     # 5000
cd frontend && npm run dev                              # 3000
cd bot && ./.venv-uv/Scripts/python.exe -m bot.main    # Telegram polling
```

---

## What it does

| Surface | What you do here |
|---|---|
| **Chat** | Streamed conversations across any OpenRouter model. Branching. Auto-titles. Vision via multimodal models. Save replies to the Knowledge Vault with one click. |
| **Arena** | Run the same prompt against 2–4 models side-by-side. Compare cost, latency, and answer quality. |
| **Debate** | 2–5 LLMs argue a topic in rounds. Configurable thinking style + length. Judge LLM synthesizes a verdict. Infinite-round mode with auto-conclude. |
| **Workflow** | Drag-and-drop canvas (React Flow). Image gen, AI agents, TTS, video gen. 15 ready-made templates including a "30-Second Product Ad" pipeline. Auto-saves. Generate-with-AI from a natural-language prompt. |
| **Image Studio** | Text-to-image, image-to-image, full history grid. Live OpenRouter image-gen models (Gemini Flash Image, GPT-5 Image, etc.). |
| **Automate Agent** | Natural-language browser automation via [browser-use Cloud](https://browser-use.com). Embedded live preview iframe. |
| **Knowledge Vault** | Bookmark valuable AI replies into folders. Tags, full-text search, favorites. |
| **Code Canvas** | Run HTML/CSS/JS code blocks in a resizable side panel with live preview, console, and shareable URLs. |
| **Telegram Gateway** | Link your account, then chat with uni-chat from inside Telegram. Native streaming animation via Bot API 9.5+ `sendMessageDraft`. Slash commands for switching model, starting a new chat, listing history, unlinking. |

Everything reuses the same conversations table and AI Preferences — replies in Telegram show up in `/chat` instantly.

---

## Quick start (local dev)

### 0. Prerequisites

- Python 3.12 with [`uv`](https://github.com/astral-sh/uv)
- Node.js 18+
- Local MongoDB on `:27017` ([install](https://www.mongodb.com/try/download/community))
- An [OpenRouter API key](https://openrouter.ai/keys)

### 1. Clone

```bash
git clone https://github.com/sepehr071/uni-chat.git
cd uni-chat
```

### 2. Backend — one-time setup

```bash
cd backend
uv venv .venv-uv --python 3.12
uv pip install -r requirements.txt
cp .env.example .env       # then fill in OPENROUTER_API_KEY + JWT_SECRET_KEY
```

Generate proper secret keys:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Drop one into `SECRET_KEY` and another into `JWT_SECRET_KEY` (both must be ≥32 bytes).

### 3. Frontend — one-time setup

```bash
cd frontend
npm install
```

### 4. Run

Open three terminals.

```bash
# Terminal 1 — backend on :5000
cd backend && ./.venv-uv/Scripts/python.exe run.py

# Terminal 2 — frontend on :3000
cd frontend && npm run dev

# Terminal 3 — Telegram bot (optional)
cd bot && ./.venv-uv/Scripts/python.exe -m bot.main
```

Open http://localhost:3000. Default admin from `.env`: `admin@admin.com` / `admin123` (change them).

### 5. (Optional) Telegram bot

```bash
cd bot
uv venv .venv-uv --python 3.12
uv pip install -e . -e ../backend -r ../backend/requirements.txt
cp .env.example .env       # fill in TELEGRAM_BOT_TOKEN from @BotFather
```

Set `POLLING=1` in `bot/.env` for local dev. Add `TELEGRAM_BOT_USERNAME=<your-bot-username>` to `backend/.env`. Then in the web app: **Settings → Telegram → Link Telegram**, complete the deep-link, and start chatting from Telegram.

---

## Stack

**Backend** — Flask, Flask-SocketIO, Flask-JWT-Extended, PyMongo, Eventlet, Gunicorn

**Frontend** — React 18, Vite, Tailwind CSS, shadcn/ui, React Query, Socket.IO, React Flow, CodeMirror 6, Motion, Three.js + dotLottie

**Bot** — aiogram 3.27 (asyncio), aiohttp, pydantic-settings, markdown-it-py — separate process, reuses backend models via editable install

**Storage** — MongoDB (local in dev, Atlas in prod)

**AI provider** — [OpenRouter](https://openrouter.ai) (one key, every model)

---

## Architecture (60-second tour)

```
                    +-----------+              +----------+
                    | Frontend  |  WebSocket   | Backend  |
                    |  (React)  | <----------> |  (Flask) |
                    +-----------+              +-----+----+
                                                     |
                                                     | PyMongo
                                                     v
+-----------+        Bot API           +-----+    +--------+
|  Telegram | <--------------------->  | Bot |--> |MongoDB |
|   user    |  sendMessageDraft / poll | aio |    +--------+
+-----------+                          +--+--+         ^
                                          |            |
                                          +------------+
                                          editable install
                                          shares backend models
                                          and OpenRouter service
```

- Backend serves REST + Socket.IO. Streaming chat goes over Socket.IO; arena/debate over SSE.
- Bot is a separate aiogram process (eventlet/asyncio collide if combined). It imports backend's `app` package via `pip install -e ../backend`, wraps DB calls in `flask_app.app_context()`, and writes to the same MongoDB so Telegram conversations show up in `/chat` immediately.
- Frontend is a standard Vite SPA. Path alias `@/` → `frontend/src/`.

For the full architecture, project conventions, and the long tail of "things that bite you", see [`CLAUDE.md`](./CLAUDE.md).

---

## Releases

See [`CHANGELOG.md`](./CHANGELOG.md). Highlights:

- **v3.1.0** — Native Telegram streaming via Bot API 9.5+ `sendMessageDraft`. Bot runtime fixes (app_context lifecycle, error reply hardening).
- **v3.0.0** — Telegram Bot Gateway (link flow, slash commands, streaming, rate limits). JWT diagnostic loaders.
- **v2.8.0** and earlier — workflow editor, automate agent, knowledge vault, debate mode, code canvas, image generation, arena.

---

## Production

Deployed as: Vercel (frontend) → Cloudflare → Nginx (Origin Cert) → Gunicorn (gthread, needed for SSE) → Flask → MongoDB Atlas. The bot runs as its own systemd unit at `127.0.0.1:8081`, with Nginx proxying `/telegram/webhook/<secret>`.

`deploy/` ships:

- `unichat-bot.service` — systemd unit
- `nginx-telegram.conf` — webhook location block
- `.github/workflows/deploy-bot.yml` — auto-deploy on `bot/**` or `backend/**` changes

---

## Contributing

Branch naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`. Conventional Commits (`feat(bot): ...`, `fix(backend): ...`). Bot tests run on `cd bot && ./.venv-uv/Scripts/python.exe -m pytest`; backend tests on the same path under `backend/`. CI = GitHub Actions for the bot + backend deploy paths; frontend deploys on push to `main`.

Bug reports and PRs welcome.

---

## License

MIT.
