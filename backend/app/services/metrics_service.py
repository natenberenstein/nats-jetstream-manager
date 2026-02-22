"""Service for collecting and querying stream metrics time-series data."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.connection_manager import ConnectionInfo, connection_manager
from app.core.db import get_db_connection

logger = logging.getLogger(__name__)


class MetricsService:

    @staticmethod
    async def collect_all_snapshots() -> int:
        """Snapshot stream stats for every active connection. Returns rows inserted."""
        now = datetime.utcnow().isoformat()
        rows = 0
        for conn_id, conn_info in list(connection_manager.connections.items()):
            try:
                if not conn_info.nc.is_connected:
                    continue
                streams = await conn_info.js.streams_info()
                conn = get_db_connection()
                try:
                    for si in streams:
                        conn.execute(
                            """INSERT INTO stream_metrics
                               (connection_id, stream_name, messages, bytes, consumer_count, collected_at)
                               VALUES (?, ?, ?, ?, ?, ?)""",
                            (
                                conn_id,
                                si.config.name,
                                si.state.messages,
                                si.state.bytes,
                                si.state.consumers,
                                now,
                            ),
                        )
                        rows += 1
                    conn.commit()
                finally:
                    conn.close()
            except Exception as e:
                logger.warning(f"Failed to collect metrics for connection {conn_id}: {e}")
        return rows

    @staticmethod
    def prune_old_metrics() -> int:
        cutoff = (datetime.utcnow() - timedelta(hours=settings.metrics_retention_hours)).isoformat()
        conn = get_db_connection()
        try:
            cur = conn.execute("DELETE FROM stream_metrics WHERE collected_at < ?", (cutoff,))
            conn.commit()
            return cur.rowcount
        finally:
            conn.close()

    @staticmethod
    def get_stream_metrics(
        connection_id: str,
        stream_name: str | None = None,
        window_minutes: int = 15,
    ) -> list[dict]:
        since = (datetime.utcnow() - timedelta(minutes=window_minutes)).isoformat()
        conn = get_db_connection()
        try:
            if stream_name:
                rows = conn.execute(
                    """SELECT stream_name, messages, bytes, consumer_count, collected_at
                       FROM stream_metrics
                       WHERE connection_id = ? AND stream_name = ? AND collected_at >= ?
                       ORDER BY collected_at""",
                    (connection_id, stream_name, since),
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT stream_name, messages, bytes, consumer_count, collected_at
                       FROM stream_metrics
                       WHERE connection_id = ? AND collected_at >= ?
                       ORDER BY collected_at""",
                    (connection_id, since),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    @staticmethod
    def get_stream_rates(
        connection_id: str,
        stream_name: str,
        window_minutes: int = 15,
    ) -> list[dict]:
        """Compute msg/sec and bytes/sec deltas between consecutive snapshots."""
        points = MetricsService.get_stream_metrics(connection_id, stream_name, window_minutes)
        rates: list[dict] = []
        for i in range(1, len(points)):
            prev = points[i - 1]
            cur = points[i]
            try:
                t_prev = datetime.fromisoformat(prev["collected_at"])
                t_cur = datetime.fromisoformat(cur["collected_at"])
                dt = (t_cur - t_prev).total_seconds()
                if dt <= 0:
                    continue
                msg_rate = max(0, (cur["messages"] - prev["messages"]) / dt)
                byte_rate = max(0, (cur["bytes"] - prev["bytes"]) / dt)
            except Exception:
                continue
            rates.append(
                {
                    "stream_name": stream_name,
                    "collected_at": cur["collected_at"],
                    "messages": cur["messages"],
                    "bytes": cur["bytes"],
                    "consumer_count": cur["consumer_count"],
                    "msg_rate": round(msg_rate, 2),
                    "byte_rate": round(byte_rate, 2),
                }
            )
        return rates
