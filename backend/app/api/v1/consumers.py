"""API endpoints for NATS JetStream consumers."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from nats.js.errors import BadRequestError, NotFoundError

from app.api.deps import get_connection, require_admin, audit_action
from app.models.schemas import (
    ConsumerAnalyticsResponse,
    ConsumerCreateRequest,
    ConsumerDeleteResponse,
    ConsumerListResponse,
)
from app.services.consumer_service import ConsumerService

router = APIRouter(tags=["consumers"])


@router.get(
    "/connections/{connection_id}/streams/{stream_name}/consumers",
    response_model=ConsumerListResponse,
)
async def list_consumers(connection_id: str, stream_name: str):
    """
    List all consumers for a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream

    Returns:
        List of consumers with their configurations
    """
    conn_info = await get_connection(connection_id)

    try:
        consumers = await ConsumerService.list_consumers(conn_info, stream_name)
        return ConsumerListResponse(consumers=consumers, total=len(consumers))

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list consumers: {str(e)}",
        )


@router.get(
    "/connections/{connection_id}/streams/{stream_name}/consumers/analytics",
    response_model=ConsumerAnalyticsResponse,
)
async def consumer_analytics(connection_id: str, stream_name: str):
    """Get lag/backlog analytics for consumers on a stream."""
    conn_info = await get_connection(connection_id)
    try:
        return await ConsumerService.get_consumer_analytics(conn_info, stream_name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get consumer analytics: {str(e)}",
        )


@router.post(
    "/connections/{connection_id}/streams/{stream_name}/consumers",
    status_code=status.HTTP_201_CREATED,
)
async def create_consumer(
    connection_id: str,
    stream_name: str,
    consumer_config: ConsumerCreateRequest,
    request: Request,
    _: None = Depends(require_admin),
):
    """
    Create a new consumer for a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        consumer_config: Consumer configuration

    Returns:
        Created consumer information
    """
    conn_info = await get_connection(connection_id)

    try:
        consumer_info = await ConsumerService.create_consumer(
            conn_info, stream_name, consumer_config
        )
        audit_action(
            request, "create_consumer", "consumer",
            consumer_config.name or consumer_config.durable_name,
            connection_id,
            details={"stream": stream_name},
        )
        return consumer_info

    except BadRequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid consumer configuration: {str(e)}",
        )
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create consumer: {str(e)}",
        )


@router.get("/connections/{connection_id}/streams/{stream_name}/consumers/{consumer_name}")
async def get_consumer(connection_id: str, stream_name: str, consumer_name: str):
    """
    Get detailed information about a consumer.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        consumer_name: Name of the consumer

    Returns:
        Consumer configuration and state
    """
    conn_info = await get_connection(connection_id)

    try:
        consumer_info = await ConsumerService.get_consumer(conn_info, stream_name, consumer_name)
        return consumer_info

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Consumer '{consumer_name}' not found on stream '{stream_name}'",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get consumer: {str(e)}",
        )


@router.delete(
    "/connections/{connection_id}/streams/{stream_name}/consumers/{consumer_name}",
    response_model=ConsumerDeleteResponse,
)
async def delete_consumer(
    connection_id: str,
    stream_name: str,
    consumer_name: str,
    request: Request,
    _: None = Depends(require_admin),
):
    """
    Delete a consumer.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        consumer_name: Name of the consumer

    Returns:
        Deletion confirmation
    """
    conn_info = await get_connection(connection_id)

    try:
        success = await ConsumerService.delete_consumer(conn_info, stream_name, consumer_name)
        audit_action(
            request, "delete_consumer", "consumer", consumer_name,
            connection_id, details={"stream": stream_name},
        )
        return ConsumerDeleteResponse(success=success, deleted_consumer=consumer_name)

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Consumer '{consumer_name}' not found on stream '{stream_name}'",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete consumer: {str(e)}",
        )
