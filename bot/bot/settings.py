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
    polling: bool = False


settings = Settings()
