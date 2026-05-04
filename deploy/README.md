# uni-chat single-host deployment

Bare-metal install for one Linux host. HTTP only. No nginx, no Cloudflare, no Vercel.
Backend serves the built frontend directly from `frontend/dist/`. Bot runs in polling mode.
MongoDB is local on `127.0.0.1`.

## Prerequisites

- Ubuntu 22.04 LTS or 24.04 LTS (Debian 12 also works), x86_64 or arm64.
- Root SSH (or `sudo` access).
- Outbound network for: apt, NodeSource, MongoDB repo, Astral (uv), npm registry, OpenRouter, Telegram.
- A Telegram bot token from BotFather.
- An OpenRouter API key.

## One-time bootstrap

```bash
# 1. Clone the repo into the canonical path. The installer refuses any other path.
sudo git clone https://github.com/<you>/uni-chat.git /opt/unichat

# 2. Run phase 1: installs prereqs, creates the unichat user, builds venvs and frontend,
#    and creates env templates in /etc/unichat/.
sudo /opt/unichat/deploy/install.sh

# 3. Fill /etc/unichat/{backend,bot,scheduler}.env. See "Required env vars" below.
sudo nano /etc/unichat/backend.env
sudo nano /etc/unichat/bot.env
sudo nano /etc/unichat/scheduler.env

# 4. Run phase 2: migrations, install systemd units, start services, smoke test.
sudo /opt/unichat/deploy/install.sh --continue
```

Once phase 2 completes you should see a banner with `http://<server-ip>:<BACKEND_PORT>`.

## Required env vars

### `/etc/unichat/backend.env`

| Var | Notes |
| --- | --- |
| `SECRET_KEY` | >=32 random bytes. `python -c 'import secrets;print(secrets.token_urlsafe(48))'`. |
| `JWT_SECRET_KEY` | >=32 random bytes. PyJWT >= 2.10 enforces this. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/unichat` for the local Mongo installed by the script. |
| `OPENROUTER_API_KEY` | From <https://openrouter.ai>. |
| `CORS_ORIGINS` | Comma-separated. Include `http://<server-ip>:<BACKEND_PORT>`. |
| `BACKEND_PORT` | Default `5000`. Bind 0.0.0.0:<port> via Gunicorn. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initial admin user. |
| `TELEGRAM_BOT_USERNAME` | Used by the linking deeplink. No `@`. |
| `SCHEDULER_BASE_URL` | `http://127.0.0.1:8082`. |

### `/etc/unichat/bot.env`

| Var | Notes |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | From BotFather. |
| `TELEGRAM_BOT_USERNAME` | Same as backend. |
| `MONGO_URI` | Same as backend. |
| `OPENROUTER_API_KEY` | Same as backend. |
| `POLLING` | `1`. Webhook mode is not supported in this single-host deploy. |
| `BOT_PORT` | `8081`. Internal only; not exposed publicly. |

### `/etc/unichat/scheduler.env`

| Var | Notes |
| --- | --- |
| `MONGO_URI` | Same as backend. |
| `OPENROUTER_API_KEY` | Same as backend. |
| `TELEGRAM_BOT_TOKEN` | Same as bot — scheduler delivers DMs through its own aiogram client. |
| `RELOAD_PORT` | `8082`. |

All env files are `chmod 0600`, owned by `unichat:unichat`.

## Smoke tests

```bash
# API health
curl -fsS http://127.0.0.1:5000/api/health

# Frontend (Gunicorn serves frontend/dist/)
curl -sI http://<server-ip>:5000/ | head -1     # expect 200

# Service status
systemctl is-active unichat unichat-bot unichat-scheduler
```

In a browser, visit `http://<server-ip>:5000`, register, log in, send a chat message,
and `/start` the Telegram bot to test the linking flow.

## Updates

```bash
sudo /opt/unichat/deploy/update.sh
```

Pulls `main`, reinstalls Python and npm deps, rebuilds the frontend, runs the three
workspace/project migrations, restarts all three services, and hits `/api/health`.

## Rollback

```bash
cd /opt/unichat
sudo -u unichat git reset --hard HEAD~1
sudo /opt/unichat/deploy/update.sh
```

For older revisions use `git log --oneline` then `git reset --hard <sha>`.
Mongo is not rolled back — run a `mongorestore` if you took a dump first.

## Logs

```bash
journalctl -u unichat -f
journalctl -u unichat-bot -f
journalctl -u unichat-scheduler -f
journalctl -u mongod -f
```

## Common issues

- **Port already in use.** Edit `BACKEND_PORT` in `/etc/unichat/backend.env`,
  then `systemctl restart unichat` and `ufw allow <new_port>/tcp`. The installer
  also refuses to continue if the port is busy.
- **MongoDB won't accept connections.** `/etc/mongod.conf` should have
  `bindIp: 127.0.0.1`. Restart with `systemctl restart mongod` and check
  `journalctl -u mongod -n 50`.
- **Frontend returns 404 / blank page.** The build artifacts are missing.
  `sudo -u unichat bash -c 'cd /opt/unichat/frontend && npm run build'`,
  then `systemctl restart unichat`.
- **Bot doesn't respond.** Confirm `TELEGRAM_BOT_TOKEN` is correct and
  `POLLING=1` in `/etc/unichat/bot.env`. `journalctl -u unichat-bot -n 100`
  will show aiogram dispatch errors.
- **JWT 401 right after login.** `JWT_SECRET_KEY` is shorter than 32 bytes.
  Generate a new one and restart the backend (this invalidates existing tokens).
- **`tzdata` errors from the scheduler.** Already in `requirements.txt`; if
  manually editing, keep it pinned.

## Backups (out of scope but recommended)

```bash
mongodump --uri "$MONGO_URI" --out "/backup/$(date +%F)"
```

Schedule with cron or a systemd timer. Rotate older dumps yourself.
