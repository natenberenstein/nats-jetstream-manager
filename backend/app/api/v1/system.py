"""API endpoints for system observability."""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import get_connection
from app.models.schemas import SystemObservabilityResponse
from app.services.system_service import SystemService

router = APIRouter(tags=["system"])


@router.get(
    "/connections/{connection_id}/system/observability",
    response_model=SystemObservabilityResponse,
)
async def get_system_observability(connection_id: str):
    """Get aggregate observability metrics for the connected cluster."""
    conn_info = await get_connection(connection_id)
    try:
        return await SystemService.get_observability(conn_info)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch system observability: {exc}",
        )
