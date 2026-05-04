from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    telegram_bot_token: str
    telegram_webhook_secret: str = ''
    telegram_bot_username: str = 'unichat_ai_bot'
    webhook_url: str = ''
    mongo_uri: str
    openrouter_api_key: str
    bot_port: int = 8081
    polling: bool = True

    def model_post_init(self, __context) -> None:
        if self.polling is False and len(self.telegram_webhook_secret) < 16:
            raise ValueError(
                'telegram_webhook_secret is required when polling=False; '
                'set POLLING=1 or supply a 16+ char secret'
            )


settings = Settings()
