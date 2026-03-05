"""Service for recording and querying the audit log."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func

from app.core.db import get_db_session
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


class AuditService:

    @staticmethod
    def log(
        action: str,
        resource_type: str,
        resource_name: str | None = None,
        user_id: int | None = None,
        user_email: str | None = None,
        connection_id: str | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> None:
        now = datetime.utcnow().isoformat()
        try:
            with get_db_session() as session:
                session.add(
                    AuditLog(
                        user_id=user_id,
                        user_email=user_email,
                        action=action,
                        resource_type=resource_type,
                        resource_name=resource_name,
                        connection_id=connection_id,
                        details_json=details,
                        ip_address=ip_address,
                        created_at=now,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

    @staticmethod
    def list_entries(
        limit: int = 50,
        offset: int = 0,
        action: str | None = None,
        resource_type: str | None = None,
        user_id: int | None = None,
    ) -> dict:
        with get_db_session() as session:
            query = session.query(AuditLog)
            if action:
                query = query.filter(AuditLog.action == action)
            if resource_type:
                query = query.filter(AuditLog.resource_type == resource_type)
            if user_id is not None:
                query = query.filter(AuditLog.user_id == user_id)

            total = query.with_entities(func.count(AuditLog.id)).scalar()
            rows = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset).all()

            entries = []
            for r in rows:
                entries.append(
                    {
                        "id": r.id,
                        "user_id": r.user_id,
                        "user_email": r.user_email,
                        "action": r.action,
                        "resource_type": r.resource_type,
                        "resource_name": r.resource_name,
                        "connection_id": r.connection_id,
                        "details": r.details_json,
                        "ip_address": r.ip_address,
                        "created_at": r.created_at,
                    }
                )

            return {"entries": entries, "total": total}
