"""Application settings, read from environment variables (or a .env file)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./powerlifting.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Sets with more reps than this are excluded from e1RM estimates.
    e1rm_max_reps: int = 10
    # Run Alembic migrations automatically when the API starts.
    auto_migrate: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
