"""API endpoints for connection health history."""

from fastapi import APIRouter, Query

from app.api.deps import get_connection
from app.models.schemas import (
    HealthCheckEntry,
    HealthHistoryResponse,
    UptimeSummaryResponse,
)
from app.services.health_service import HealthService

router = APIRouter(tags=["health"])


@router.get(
    "/connections/{connection_id}/health/history",
    response_model=HealthHistoryResponse,
)
async def get_health_history(
    connection_id: str,
    window: int = Query(24, ge=1, le=168, description="Window in hours"),
):
    """Get health check history for a connection."""
    await get_connection(connection_id)
    raw = HealthService.get_health_history(connection_id, window)
    checks = [HealthCheckEntry(**r) for r in raw]
    return HealthHistoryResponse(
        connection_id=connection_id, checks=checks, window_hours=window
    )


@router.get(
    "/connections/{connection_id}/health/uptime",
    response_model=UptimeSummaryResponse,
)
async def get_uptime_summary(
    connection_id: str,
    window: int = Query(24, ge=1, le=168, description="Window in hours"),
):
    """Get uptime summary for a connection."""
    await get_connection(connection_id)
    summary = HealthService.get_uptime_summary(connection_id, window)
    return UptimeSummaryResponse(connection_id=connection_id, **summary)
