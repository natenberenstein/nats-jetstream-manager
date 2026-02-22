"""Service for recording and querying the audit log."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from app.core.db import get_db_connection

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
        conn = get_db_connection()
        try:
            conn.execute(
                """INSERT INTO audit_log
                   (user_id, user_email, action, resource_type, resource_name,
                    connection_id, details_json, ip_address, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    user_email,
                    action,
                    resource_type,
                    resource_name,
                    connection_id,
                    json.dumps(details) if details else None,
                    ip_address,
                    now,
                ),
            )
            conn.commit()
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
        finally:
            conn.close()

    @staticmethod
    def list_entries(
        limit: int = 50,
        offset: int = 0,
        action: str | None = None,
        resource_type: str | None = None,
        user_id: int | None = None,
    ) -> dict:
        conditions = []
        params: list[Any] = []
        if action:
            conditions.append("action = ?")
            params.append(action)
        if resource_type:
            conditions.append("resource_type = ?")
            params.append(resource_type)
        if user_id is not None:
            conditions.append("user_id = ?")
            params.append(user_id)

        where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

        conn = get_db_connection()
        try:
            total = conn.execute(f"SELECT COUNT(*) FROM audit_log{where}", params).fetchone()[0]
            rows = conn.execute(
                f"""SELECT id, user_id, user_email, action, resource_type, resource_name,
                           connection_id, details_json, ip_address, created_at
                    FROM audit_log{where}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?""",
                params + [limit, offset],
            ).fetchall()

            entries = []
            for r in rows:
                entry = dict(r)
                raw = entry.pop("details_json", None)
                entry["details"] = json.loads(raw) if raw else None
                entries.append(entry)

            return {"entries": entries, "total": total}
        finally:
            conn.close()
