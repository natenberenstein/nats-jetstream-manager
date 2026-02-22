"""API endpoints for NATS JetStream streams."""

from fastapi import APIRouter, Depends, HTTPException, status
from nats.js.errors import BadRequestError, NotFoundError

from app.api.deps import get_connection, require_admin
from app.core.connection_manager import ConnectionInfo
from app.models.schemas import (
    StreamCreateRequest,
    StreamDeleteResponse,
    StreamListResponse,
    StreamPurgeResponse,
    StreamUpdateRequest,
)
from app.services.stream_service import StreamService

router = APIRouter(tags=["streams"])


@router.get("/connections/{connection_id}/streams", response_model=StreamListResponse)
async def list_streams(connection_id: str):
    """
    List all streams in the connected NATS cluster.

    Args:
        connection_id: Connection ID

    Returns:
        List of streams with their configurations and states
    """
    conn_info = await get_connection(connection_id)

    try:
        streams = await StreamService.list_streams(conn_info)
        return StreamListResponse(streams=streams, total=len(streams))

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list streams: {str(e)}",
        )


@router.post("/connections/{connection_id}/streams", status_code=status.HTTP_201_CREATED)
async def create_stream(
    connection_id: str,
    stream_config: StreamCreateRequest,
    _: None = Depends(require_admin),
):
    """
    Create a new stream.

    Args:
        connection_id: Connection ID
        stream_config: Stream configuration

    Returns:
        Created stream information
    """
    conn_info = await get_connection(connection_id)

    try:
        stream_info = await StreamService.create_stream(conn_info, stream_config)
        return stream_info

    except BadRequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stream configuration: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create stream: {str(e)}",
        )


@router.get("/connections/{connection_id}/streams/{stream_name}")
async def get_stream(connection_id: str, stream_name: str):
    """
    Get detailed information about a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream

    Returns:
        Stream configuration and state
    """
    conn_info = await get_connection(connection_id)

    try:
        stream_info = await StreamService.get_stream(conn_info, stream_name)
        return stream_info

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get stream: {str(e)}",
        )


@router.put("/connections/{connection_id}/streams/{stream_name}")
async def update_stream(
    connection_id: str,
    stream_name: str,
    update_config: StreamUpdateRequest,
    _: None = Depends(require_admin),
):
    """
    Update an existing stream's configuration.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        update_config: Updated configuration

    Returns:
        Updated stream information
    """
    conn_info = await get_connection(connection_id)

    try:
        stream_info = await StreamService.update_stream(conn_info, stream_name, update_config)
        return stream_info

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        )
    except BadRequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stream configuration: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stream: {str(e)}",
        )


@router.delete(
    "/connections/{connection_id}/streams/{stream_name}", response_model=StreamDeleteResponse
)
async def delete_stream(
    connection_id: str,
    stream_name: str,
    _: None = Depends(require_admin),
):
    """
    Delete a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream

    Returns:
        Deletion confirmation
    """
    conn_info = await get_connection(connection_id)

    try:
        success = await StreamService.delete_stream(conn_info, stream_name)
        return StreamDeleteResponse(success=success, deleted_stream=stream_name)

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete stream: {str(e)}",
        )


@router.post(
    "/connections/{connection_id}/streams/{stream_name}/purge", response_model=StreamPurgeResponse
)
async def purge_stream(
    connection_id: str,
    stream_name: str,
    _: None = Depends(require_admin),
):
    """
    Purge all messages from a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream

    Returns:
        Purge confirmation
    """
    conn_info = await get_connection(connection_id)

    try:
        success = await StreamService.purge_stream(conn_info, stream_name)
        return StreamPurgeResponse(success=success, purged=True)

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to purge stream: {str(e)}",
        )
