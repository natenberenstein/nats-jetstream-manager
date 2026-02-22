"""API endpoints for cluster overview and topology."""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import get_connection
from app.models.schemas import ClusterOverviewResponse
from app.services.cluster_service import ClusterService

router = APIRouter(tags=["cluster"])


@router.get("/connections/{connection_id}/cluster/overview", response_model=ClusterOverviewResponse)
async def get_cluster_overview(connection_id: str):
    """Get a high-level view of NATS/JetStream cluster state."""
    conn_info = await get_connection(connection_id)

    try:
        return await ClusterService.get_overview(conn_info)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch cluster overview: {exc}",
        )
