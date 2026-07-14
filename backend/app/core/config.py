"""
Central app configuration. Values are read from environment variables /
a .env file (see .env.example). Nothing here should be hardcoded in code
that ships — secrets always come from the environment.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # -- app --
    APP_NAME: str = "RepoMind AI"
    ENV: str = "development"
    DEBUG: bool = True

    # -- auth --
    JWT_SECRET_KEY: str = "change-me-in-production"  # override via env in real deploys
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # -- database --
    DATABASE_URL: str = "sqlite:///./repomind.db"  # swap for postgresql://... in production

    # -- AI providers --
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    # -- oauth (GitHub / Google) --
    # Register real apps to get these — see backend/README.md for exact steps.
    # Leave a provider's client id blank to disable that provider's buttons.
    BACKEND_URL: str = "http://localhost:8000"   # used to build the OAuth callback URL
    FRONTEND_URL: str = "http://localhost:5500"  # where we send the user after login
    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: str | None = None
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None

    # -- vector store --
    CHROMA_PERSIST_DIR: str = "./chroma_data"

    # -- cors --
    # "*" is safe here because auth uses bearer tokens, not cookies, so
    # allow_credentials stays False. Tighten this to your real frontend
    # origin(s) before deploying anywhere public.
    ALLOWED_ORIGINS: list[str] = ["*"]


settings = Settings()
