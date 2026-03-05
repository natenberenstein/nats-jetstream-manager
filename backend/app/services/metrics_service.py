"""Service for collecting and querying stream metrics time-series data."""

from __future__ import annotations

from loguru import logger
from datetime import datetime, timedelta

from app.core.config import settings
from app.core.connection_manager import connection_manager
from app.core.db import get_db_session
from app.models.metrics import StreamMetric




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
                with get_db_session() as session:
                    for si in streams:
                        session.add(
                            StreamMetric(
                                connection_id=conn_id,
                                stream_name=si.config.name,
                                messages=si.state.messages,
                                bytes=si.state.bytes,
                                consumer_count=si.state.consumers,
                                collected_at=now,
                            )
                        )
                        rows += 1
            except Exception as e:
                logger.warning(f"Failed to collect metrics for connection {conn_id}: {e}")
        return rows

    @staticmethod
    def prune_old_metrics() -> int:
        cutoff = (datetime.utcnow() - timedelta(hours=settings.metrics_retention_hours)).isoformat()
        with get_db_session() as session:
            deleted = (
                session.query(StreamMetric)
                .filter(StreamMetric.collected_at < cutoff)
                .delete(synchronize_session=False)
            )
            return deleted

    @staticmethod
    def get_stream_metrics(
        connection_id: str,
        stream_name: str | None = None,
        window_minutes: int = 15,
    ) -> list[dict]:
        since = (datetime.utcnow() - timedelta(minutes=window_minutes)).isoformat()
        with get_db_session() as session:
            query = session.query(StreamMetric).filter(
                StreamMetric.connection_id == connection_id,
                StreamMetric.collected_at >= since,
            )
            if stream_name:
                query = query.filter(StreamMetric.stream_name == stream_name)
            rows = query.order_by(StreamMetric.collected_at).all()
            return [
                {
                    "stream_name": r.stream_name,
                    "messages": r.messages,
                    "bytes": r.bytes,
                    "consumer_count": r.consumer_count,
                    "collected_at": r.collected_at,
                }
                for r in rows
            ]

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
