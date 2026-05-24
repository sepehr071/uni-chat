import os
from datetime import timedelta


class Config:
    """Base configuration"""
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # Database
    MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/unichat')

    # OpenRouter API
    OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')
    OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

    # File uploads
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'txt'}

    # Meetings feature
    ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')
    MEETING_UPLOAD_SUBDIR = 'meetings'
    MEETING_ALLOWED_AUDIO_EXTS = {'mp3', 'wav', 'm4a', 'webm', 'ogg', 'mp4'}
    MEETING_MAX_AUDIO_BYTES = 500 * 1024 * 1024  # 500MB cap; route streams past Flask's MAX_CONTENT_LENGTH

    # Rate limiting
    RATELIMIT_DEFAULT = "100 per minute"
    RATELIMIT_STORAGE_URL = "memory://"

    # CORS — raw env value; no default (production must set, dev gets None → flask-cors allows all)
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS')

    # Keycloak SSO — optional. When KEYCLOAK_URL is blank, SSO is disabled and
    # the backend serves only the legacy HS256 email/password auth path.
    # Token validity check uses claim `azp == client_id` (canonical KC pattern).
    # No separate audience var needed.
    KEYCLOAK_URL = os.environ.get('KEYCLOAK_URL', '').rstrip('/')          # e.g. https://kc-novis.novin-dev.ir
    KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM', '')                  # e.g. novis
    KEYCLOAK_CLIENT_ID = os.environ.get('KEYCLOAK_CLIENT_ID', '')          # e.g. tariq

    @staticmethod
    def validate():
        """Validate required environment variables"""
        required = ['SECRET_KEY', 'JWT_SECRET_KEY', 'OPENROUTER_API_KEY']
        missing = [var for var in required if not os.environ.get(var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

        secret_key = os.environ.get('SECRET_KEY', '')
        if len(secret_key) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")

        jwt_secret = os.environ.get('JWT_SECRET_KEY', '')
        if len(jwt_secret) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters long")


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'

    # Relaxed settings for development
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    RATELIMIT_ENABLED = False

    @staticmethod
    def validate():
        # Development can use defaults
        pass


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'

    # Stricter settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

    # Rate limiting
    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URL = os.environ.get('REDIS_URL', 'memory://')

    # CORS must be explicit in production — parse comma-separated origins
    CORS_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]

    @staticmethod
    def validate():
        Config.validate()

        # Additional production checks
        # CORS must be explicit in production UNLESS same-origin deploy (Traefik
        # fronts frontend + backend on the same domain → CORS not used).
        # Set SAME_ORIGIN=1 in prod compose env to skip this guard.
        same_origin = os.environ.get('SAME_ORIGIN', '').strip() in {'1', 'true', 'True'}
        if not os.environ.get('CORS_ORIGINS') and not same_origin:
            raise ValueError("CORS_ORIGINS must be set in production (or set SAME_ORIGIN=1)")

        mongo_uri = os.environ.get('MONGO_URI', '')
        if not mongo_uri:
            raise ValueError("MONGO_URI must be set in production")
        # Warn but allow local Mongo (single-host deploys run MongoDB on the same machine)
        if 'localhost' in mongo_uri or '127.0.0.1' in mongo_uri:
            import logging
            logging.getLogger(__name__).warning(
                "MONGO_URI points to localhost — ensure MongoDB is running on this host."
            )


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    MONGO_URI = 'mongodb://localhost:27017/unichat_test'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    RATELIMIT_ENABLED = False

    @staticmethod
    def validate():
        pass


# Config selector
config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config():
    """Get configuration based on environment"""
    env = os.environ.get('FLASK_ENV', 'development')
    config_class = config_by_name.get(env, DevelopmentConfig)
    config_class.validate()
    return config_class
