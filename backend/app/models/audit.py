from __future__ import annotations

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None]
    user_email: Mapped[str | None]
    action: Mapped[str]
    resource_type: Mapped[str]
    resource_name: Mapped[str | None]
    connection_id: Mapped[str | None]
    details_json: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None]
    created_at: Mapped[str]


Index("idx_audit_log_created", AuditLog.created_at)
Index("idx_audit_log_action", AuditLog.action)
Index("idx_audit_log_resource_type", AuditLog.resource_type)
