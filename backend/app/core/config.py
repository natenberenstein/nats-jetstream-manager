"""Application configuration using Pydantic settings."""

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # Application
    app_name: str = "NATS JetStream Manager"
    version: str = "1.0.0"
    environment: str = "development"
    log_level: str = "info"

    # CORS
    cors_origins: List[str] = ["http://localhost:3000"]

    # Connection Management
    max_connections: int = 100
    connection_timeout: int = 300  # seconds

    # Auth/RBAC
    auth_enabled: bool = False
    admin_token: str = ""
    viewer_token: str = ""
    user_auth_enabled: bool = True
    database_path: str = "./data/nats_manager.db"
    session_ttl_hours: int = 24 * 7
    invite_ttl_hours: int = 72

    # Email invitations
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    invite_from_email: str = "noreply@nats-manager.local"
    app_base_url: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")


settings = Settings()
