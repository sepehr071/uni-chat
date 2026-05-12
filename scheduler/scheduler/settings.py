"""Pydantic settings for the scheduler service.

Reads scheduler/.env via the package-level load_dotenv (see __init__.py).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    mongo_uri: str
    openrouter_api_key: str = ''
    telegram_bot_token: str = ''
    reload_port: int = 8082
    # Shared-secret for /internal/* endpoints. When empty, the scheduler
    # boots with auth disabled and only accepts loopback requests; in any
    # deployment with potentially-hostile co-tenants this MUST be set.
    internal_token: str = ''


settings = Settings()
