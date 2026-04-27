# uni-chat Telegram Bot

## Local dev (polling)

```
cd bot
uv venv .venv-uv --python 3.12
. .venv-uv/Scripts/activate
uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt
cp .env.example .env  # fill in TELEGRAM_BOT_TOKEN + MONGO_URI + OPENROUTER_API_KEY
POLLING=1 python -m bot.main
```

## Prod (webhook)

systemd unit at `deploy/unichat-bot.service`. nginx snippet at `deploy/nginx-telegram.conf`.

Set webhook on first boot — happens automatically in `bot/main.py:on_startup`.

## First-time prod deploy

1. SSH to server, clone repo to `/opt/unichat`, create user `unichat`, `chown -R unichat:unichat /opt/unichat`.
2. `cd /opt/unichat/bot && uv venv .venv-uv --python 3.12 && uv pip install -e ".[dev]" -e ../backend -r ../backend/requirements.txt`
3. `cp /opt/unichat/bot/.env.example /opt/unichat/bot/.env` and fill values (TELEGRAM_BOT_TOKEN from BotFather, WEBHOOK_URL, secret).
4. `sudo cp /opt/unichat/deploy/unichat-bot.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now unichat-bot`
5. Add the nginx snippet to the existing API site config and `nginx -s reload`.
6. Verify: `journalctl -u unichat-bot -f` shows "Webhook set to https://<your-api-domain>/telegram/webhook/<secret>".
7. Send `/help` to bot. Watch journal for delivery.

## BotFather setup

- /newbot → pick username e.g. `unichat_ai_bot`
- /setdescription, /setabouttext, /setuserpic
- /setcommands → paste:
  ```
  start - Link your uni-chat account
  new - Start a new conversation
  model - Pick a model
  assistant - Pick a saved assistant
  history - Recent conversations
  unlink - Disconnect Telegram
  help - Commands
  ```
- /setprivacy → enabled (default)
- /setjoingroups → disable
- /setinline → disable
