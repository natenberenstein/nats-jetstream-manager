"""API endpoints for stream metrics time-series data."""

from fastapi import APIRouter, Query

from app.api.deps import get_connection
from app.models.schemas import (
    StreamMetricPoint,
    StreamMetricsResponse,
    StreamMetricsSummaryResponse,
)
from app.services.metrics_service import MetricsService

router = APIRouter(tags=["metrics"])


@router.get(
    "/connections/{connection_id}/metrics/streams/{stream_name}",
    response_model=StreamMetricsResponse,
)
async def get_stream_metrics(
    connection_id: str,
    stream_name: str,
    window: int = Query(15, ge=1, le=1440, description="Window in minutes"),
):
    """Get rate metrics for a single stream."""
    await get_connection(connection_id)
    rates = MetricsService.get_stream_rates(connection_id, stream_name, window)
    points = [StreamMetricPoint(**r) for r in rates]
    return StreamMetricsResponse(
        stream_name=stream_name, points=points, window_minutes=window
    )


@router.get(
    "/connections/{connection_id}/metrics/streams",
    response_model=StreamMetricsSummaryResponse,
)
async def get_all_stream_metrics(
    connection_id: str,
    window: int = Query(15, ge=1, le=1440, description="Window in minutes"),
):
    """Get rate metrics for all streams on a connection."""
    await get_connection(connection_id)
    raw = MetricsService.get_stream_metrics(connection_id, window_minutes=window)

    # Group by stream name
    by_stream: dict[str, list[dict]] = {}
    for r in raw:
        by_stream.setdefault(r["stream_name"], []).append(r)

    streams = []
    for name, points_raw in by_stream.items():
        rates = MetricsService.get_stream_rates(connection_id, name, window)
        points = [StreamMetricPoint(**r) for r in rates]
        streams.append(
            StreamMetricsResponse(stream_name=name, points=points, window_minutes=window)
        )

    return StreamMetricsSummaryResponse(
        connection_id=connection_id, streams=streams, window_minutes=window
    )
