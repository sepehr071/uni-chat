# uni-chat Telegram Bot

## Local dev (polling)

```
cd bot
uv venv .venv-uv --python 3.12
. .venv-uv/Scripts/activate
uv pip install -e .[dev] -e ../backend
cp .env.example .env  # fill in TELEGRAM_BOT_TOKEN + MONGO_URI + OPENROUTER_API_KEY
POLLING=1 python -m bot.main
```

## Prod (webhook)

systemd unit at `deploy/unichat-bot.service`. nginx snippet at `deploy/nginx-telegram.conf`.

Set webhook on first boot — happens automatically in `bot/main.py:on_startup`.
