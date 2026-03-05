from __future__ import annotations

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(primary_key=True)  # UUID
    connection_id: Mapped[str | None]
    job_type: Mapped[str]
    status: Mapped[str]
    progress: Mapped[float] = mapped_column(default=0)
    current: Mapped[int | None]
    total: Mapped[int | None]
    message: Mapped[str | None]
    error: Mapped[str | None]
    payload_json: Mapped[dict | None] = mapped_column(JSON)
    result_json: Mapped[dict | None] = mapped_column(JSON)
    cancel_requested: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[str]
    started_at: Mapped[str | None]
    completed_at: Mapped[str | None]


Index("idx_jobs_connection_id", Job.connection_id)
Index("idx_jobs_status", Job.status)
