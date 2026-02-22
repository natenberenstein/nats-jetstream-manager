"""Service for system observability snapshots."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.connection_manager import ConnectionInfo


class SystemService:
    """Builds aggregate observability payloads."""

    @staticmethod
    async def get_observability(conn_info: ConnectionInfo) -> dict[str, Any]:
        account_info = await conn_info.js.account_info()
        stream_infos = await conn_info.js.streams_info()

        total_streams = 0
        total_consumers = 0
        total_messages = 0
        total_bytes = 0
        stream_bytes: list[tuple[str, int]] = []
        stream_messages: list[tuple[str, int]] = []

        for stream_info in stream_infos:
            total_streams += 1
            state = stream_info.state
            total_consumers += state.consumer_count
            total_messages += state.messages
            total_bytes += state.bytes
            stream_name = stream_info.config.name
            stream_bytes.append((stream_name, int(state.bytes)))
            stream_messages.append((stream_name, int(state.messages)))

        limits = getattr(account_info, "limits", None)
        memory_used = getattr(account_info, "memory", None)
        storage_used = getattr(account_info, "storage", None)
        memory_limit = getattr(limits, "max_memory", None) if limits else None
        storage_limit = getattr(limits, "max_storage", None) if limits else None

        def utilization(used: int | None, limit: int | None) -> float | None:
            if used is None or limit is None or limit <= 0:
                return None
            return round((used / limit) * 100, 2)

        api_stats = getattr(account_info, "api", None)

        return {
            "connected": conn_info.nc.is_connected,
            "server_version": str(getattr(conn_info.nc, "connected_server_version", "")) or None,
            "uptime_hint_seconds": int((datetime.now(tz=timezone.utc) - conn_info.created_at.replace(tzinfo=timezone.utc)).total_seconds()),
            "streams": total_streams,
            "consumers": total_consumers,
            "messages": total_messages,
            "bytes": total_bytes,
            "js_api_total": getattr(api_stats, "total", None) if api_stats else None,
            "js_api_errors": getattr(api_stats, "errors", None) if api_stats else None,
            "memory_used": memory_used,
            "storage_used": storage_used,
            "memory_limit": memory_limit,
            "storage_limit": storage_limit,
            "memory_utilization": utilization(memory_used, memory_limit),
            "storage_utilization": utilization(storage_used, storage_limit),
            "top_streams_by_bytes": [
                {"name": name, "value": float(value)}
                for name, value in sorted(stream_bytes, key=lambda item: item[1], reverse=True)[:8]
            ],
            "top_streams_by_messages": [
                {"name": name, "value": float(value)}
                for name, value in sorted(stream_messages, key=lambda item: item[1], reverse=True)[:8]
            ],
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
