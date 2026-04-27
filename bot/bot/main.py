import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

from bot.settings import settings

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('unichat-bot')

bot = Bot(
    token=settings.telegram_bot_token,
    default=DefaultBotProperties(parse_mode=ParseMode.HTML),
)
dp = Dispatcher()

from bot.handlers import start as start_handlers
dp.include_router(start_handlers.router)

from bot.handlers import commands as commands_handlers
dp.include_router(commands_handlers.router)


async def on_startup(app: web.Application):
    if settings.webhook_url:
        url = settings.webhook_url.rstrip('/') + '/' + settings.telegram_webhook_secret
        await bot.set_webhook(url, secret_token=settings.telegram_webhook_secret, allowed_updates=['message', 'callback_query'])
        log.info('Webhook set to %s', url)


async def on_shutdown(app: web.Application):
    await bot.session.close()


def run_polling():
    log.info('Starting in polling mode')
    asyncio.run(dp.start_polling(bot))


def run_webhook():
    log.info('Starting webhook server on :%d', settings.bot_port)
    app = web.Application()
    handler = SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=settings.telegram_webhook_secret)
    handler.register(app, path=f'/{settings.telegram_webhook_secret}')
    setup_application(app, dp, bot=bot)
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    web.run_app(app, host='127.0.0.1', port=settings.bot_port)


def main():
    if settings.polling:
        run_polling()
    else:
        run_webhook()


if __name__ == '__main__':
    main()
