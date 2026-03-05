"""API endpoints for NATS connections."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.connection_manager import connection_manager
from app.api.deps import require_admin, audit_action
from app.models.schemas import (
    ConnectionListResponse,
    ConnectionRequest,
    ConnectionResponse,
    ConnectionTestResponse,
    ConnectionStatusResponse
)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.get("", response_model=ConnectionListResponse)
async def list_connections():
    """List all active cluster connections for the current backend process."""
    connections = await connection_manager.list_connections()
    return ConnectionListResponse(connections=connections, total=len(connections))


@router.post("/test", response_model=ConnectionTestResponse)
async def test_connection(request: ConnectionRequest):
    """
    Test a connection to a NATS cluster without creating a session.

    Args:
        request: Connection request with URL and optional credentials

    Returns:
        Connection test results
    """
    result = await connection_manager.test_connection(
        url=request.url,
        user=request.user,
        password=request.password,
        token=request.token
    )
    return result


@router.post("/connect", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    request: ConnectionRequest,
    http_request: Request,
):
    """
    Establish a connection to a NATS cluster and create a session.

    Args:
        request: Connection request with URL and optional credentials

    Returns:
        Connection ID and status
    """
    try:
        connection_id = await connection_manager.create_connection(
            url=request.url,
            user=request.user,
            password=request.password,
            token=request.token
        )

        audit_action(
            http_request, "connect", "connection", request.url,
            connection_id,
        )
        return ConnectionResponse(
            connection_id=connection_id,
            status="connected",
            url=request.url
        )

    except ConnectionError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )


@router.get("/{connection_id}/status", response_model=ConnectionStatusResponse)
async def get_connection_status(connection_id: str):
    """
    Get the status of a connection.

    Args:
        connection_id: Connection ID

    Returns:
        Connection status information
    """
    status_info = await connection_manager.get_connection_status(connection_id)
    return status_info


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    connection_id: str,
    request: Request,
    _: None = Depends(require_admin),
):
    """
    Disconnect and remove a connection.

    Args:
        connection_id: Connection ID
    """
    removed = await connection_manager.remove_connection(connection_id)
    if removed:
        audit_action(request, "disconnect", "connection", connection_id, connection_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection {connection_id} not found"
        )
