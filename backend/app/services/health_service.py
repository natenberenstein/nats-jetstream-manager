"""Service for connection health checks and uptime tracking."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.connection_manager import connection_manager
from app.core.db import get_db_connection

logger = logging.getLogger(__name__)


class HealthService:

    @staticmethod
    async def check_all_connections() -> int:
        """Ping every active connection and record health. Returns rows inserted."""
        now = datetime.utcnow().isoformat()
        rows = 0
        for conn_id, conn_info in list(connection_manager.connections.items()):
            status = "up"
            error_msg = None
            jetstream_ok = True
            try:
                if not conn_info.nc.is_connected:
                    status = "down"
                    error_msg = "NATS connection is not connected"
                else:
                    try:
                        await conn_info.js.account_info()
                    except Exception as js_err:
                        jetstream_ok = False
                        error_msg = f"JetStream unavailable: {js_err}"
            except Exception as e:
                status = "down"
                error_msg = str(e)

            conn = get_db_connection()
            try:
                conn.execute(
                    """INSERT INTO connection_health
                       (connection_id, url, status, jetstream_ok, error, checked_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (conn_id, conn_info.url, status, int(jetstream_ok), error_msg, now),
                )
                conn.commit()
                rows += 1
            finally:
                conn.close()
        return rows

    @staticmethod
    def prune_old_records() -> int:
        cutoff = (datetime.utcnow() - timedelta(days=settings.health_retention_days)).isoformat()
        conn = get_db_connection()
        try:
            cur = conn.execute("DELETE FROM connection_health WHERE checked_at < ?", (cutoff,))
            conn.commit()
            return cur.rowcount
        finally:
            conn.close()

    @staticmethod
    def get_health_history(connection_id: str, window_hours: int = 24) -> list[dict]:
        since = (datetime.utcnow() - timedelta(hours=window_hours)).isoformat()
        conn = get_db_connection()
        try:
            rows = conn.execute(
                """SELECT status, jetstream_ok, error, checked_at
                   FROM connection_health
                   WHERE connection_id = ? AND checked_at >= ?
                   ORDER BY checked_at""",
                (connection_id, since),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @staticmethod
    def get_uptime_summary(connection_id: str, window_hours: int = 24) -> dict:
        history = HealthService.get_health_history(connection_id, window_hours)
        total = len(history)
        if total == 0:
            return {
                "total_checks": 0,
                "up_checks": 0,
                "down_checks": 0,
                "uptime_pct": 0.0,
                "last_status": None,
                "last_error": None,
                "last_checked_at": None,
            }
        up = sum(1 for h in history if h["status"] == "up")
        down = total - up
        last = history[-1]
        return {
            "total_checks": total,
            "up_checks": up,
            "down_checks": down,
            "uptime_pct": round(up / total * 100, 2),
            "last_status": last["status"],
            "last_error": last.get("error"),
            "last_checked_at": last["checked_at"],
        }
