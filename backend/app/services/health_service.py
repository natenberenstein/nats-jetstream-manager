"""Service for connection health checks and uptime tracking."""

from __future__ import annotations

from loguru import logger
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.connection_manager import connection_manager
from app.core.db import get_db_session
from app.models.health import ConnectionHealth




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

            with get_db_session() as session:
                session.add(
                    ConnectionHealth(
                        connection_id=conn_id,
                        url=conn_info.url,
                        status=status,
                        jetstream_ok=int(jetstream_ok),
                        error=error_msg,
                        checked_at=now,
                    )
                )
                rows += 1
        return rows

    @staticmethod
    def prune_old_records() -> int:
        cutoff = (datetime.utcnow() - timedelta(days=settings.health_retention_days)).isoformat()
        with get_db_session() as session:
            deleted = (
                session.query(ConnectionHealth)
                .filter(ConnectionHealth.checked_at < cutoff)
                .delete(synchronize_session=False)
            )
            return deleted

    @staticmethod
    def get_health_history(connection_id: str, window_hours: int = 24) -> list[dict]:
        since = (datetime.utcnow() - timedelta(hours=window_hours)).isoformat()
        with get_db_session() as session:
            rows = (
                session.query(ConnectionHealth)
                .filter(
                    ConnectionHealth.connection_id == connection_id,
                    ConnectionHealth.checked_at >= since,
                )
                .order_by(ConnectionHealth.checked_at)
                .all()
            )
            return [
                {
                    "status": r.status,
                    "jetstream_ok": r.jetstream_ok,
                    "error": r.error,
                    "checked_at": r.checked_at,
                }
                for r in rows
            ]

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
