from __future__ import annotations

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConnectionHealth(Base):
    __tablename__ = "connection_health"

    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[str]
    url: Mapped[str]
    status: Mapped[str]
    jetstream_ok: Mapped[int] = mapped_column(default=1)
    error: Mapped[str | None]
    checked_at: Mapped[str]


Index("idx_connection_health_conn", ConnectionHealth.connection_id, ConnectionHealth.checked_at)
