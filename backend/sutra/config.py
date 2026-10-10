"""Configuration settings for SŪTRA."""

from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment or .env file."""

    HOST: str = "127.0.0.1"
    PORT: int = 8000
    WORKSPACE_ROOT: str = "."
    DATABASE_PATH: str = "sutra_audit.db"
    CORS_ORIGIN: str = "http://localhost:5173"
    
    # Security & Protection settings
    DEBUG: bool = False
    ADMIN_TOKEN: Optional[str] = None
    RATE_LIMIT_ENABLED: bool = True
    
    # Telegram Bot configuration (optional, long polling only)
    BOT_TOKEN: Optional[str] = None
    
    # Ollama / Gemma configuration (optional, advisory only)
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma3:4b"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def workspace_path(self) -> Path:
        return Path(self.WORKSPACE_ROOT).resolve()

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.CORS_ORIGIN]
        if "localhost" in self.CORS_ORIGIN:
            origins.append(self.CORS_ORIGIN.replace("localhost", "127.0.0.1"))
        return origins


settings = Settings()
