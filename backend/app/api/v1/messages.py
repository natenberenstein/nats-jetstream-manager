"""API endpoints for NATS JetStream messages."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from nats.js.errors import NotFoundError

from app.api.deps import get_connection, require_admin, audit_action
from app.models.schemas import (
    MessageData,
    MessageBatchPublishRequest,
    MessageBatchPublishResponse,
    MessageIndexBuildRequest,
    MessageIndexSearchResponse,
    MessagePublishRequest,
    MessagePublishResponse,
    MessageReplayRequest,
    MessageReplayResponse,
    MessagesResponse,
    SchemaValidationRequest,
    SchemaValidationResponse,
)
from app.services.message_service import MessageService

router = APIRouter(tags=["messages"])


@router.post("/connections/{connection_id}/messages/publish", response_model=MessagePublishResponse)
async def publish_message(
    connection_id: str,
    request: MessagePublishRequest,
    http_request: Request,
    _: None = Depends(require_admin),
):
    """
    Publish a message to a subject.

    Args:
        connection_id: Connection ID
        request: Message publish request

    Returns:
        Publish acknowledgment with stream and sequence
    """
    conn_info = await get_connection(connection_id)

    try:
        result = await MessageService.publish_message(conn_info, request)
        audit_action(
            http_request, "publish_message", "message", request.subject,
            connection_id, details={"seq": result.seq, "stream": result.stream},
        )
        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish message: {str(e)}",
        ) from e


@router.post(
    "/connections/{connection_id}/messages/publish-batch",
    response_model=MessageBatchPublishResponse,
)
async def publish_batch(
    connection_id: str,
    request: MessageBatchPublishRequest,
    http_request: Request,
    _: None = Depends(require_admin),
):
    """
    Publish multiple messages to a subject.

    Args:
        connection_id: Connection ID
        request: Batch publish request

    Returns:
        Batch publish results
    """
    conn_info = await get_connection(connection_id)

    try:
        result = await MessageService.publish_batch(conn_info, request)
        audit_action(
            http_request, "publish_batch", "message", request.subject,
            connection_id, details={"count": result.published},
        )
        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish batch: {str(e)}",
        ) from e


@router.get(
    "/connections/{connection_id}/streams/{stream_name}/messages", response_model=MessagesResponse
)
async def get_messages(
    connection_id: str,
    stream_name: str,
    limit: int = Query(50, ge=1, le=1000, description="Maximum number of messages"),
    seq_start: int | None = Query(None, ge=1, description="Starting sequence number"),
    seq_end: int | None = Query(None, ge=1, description="Ending sequence number"),
    include_payload: bool = Query(
        False, description="Include full payload in list response (slower for large messages)"
    ),
    from_latest: bool = Query(
        False, description="Start from latest messages when seq_start is omitted"
    ),
    filter_subject: str | None = Query(None, description="Filter subject pattern (wildcards supported)"),
    header_key: str | None = Query(None, description="Header key filter"),
    header_value: str | None = Query(None, description="Header value filter"),
    payload_contains: str | None = Query(None, description="Case-insensitive payload substring filter"),
    preview_bytes: int = Query(
        1024, ge=64, le=65536, description="Maximum bytes to include in payload preview"
    ),
):
    """
    Get messages from a stream.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        limit: Maximum number of messages to retrieve
        seq_start: Optional starting sequence number

    Returns:
        List of messages with metadata
    """
    conn_info = await get_connection(connection_id)

    try:
        result = await MessageService.get_messages(
            conn_info,
            stream_name,
            limit=limit,
            seq_start=seq_start,
            seq_end=seq_end,
            include_payload=include_payload,
            preview_bytes=preview_bytes,
            from_latest=from_latest,
            filter_subject=filter_subject,
            header_key=header_key,
            header_value=header_value,
            payload_contains=payload_contains,
        )
        return MessagesResponse(**result)

    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Stream '{stream_name}' not found"
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get messages: {str(e)}",
        ) from e


@router.get("/connections/{connection_id}/streams/{stream_name}/messages/{seq}")
async def get_message(connection_id: str, stream_name: str, seq: int):
    """
    Get a specific message by sequence number.

    Args:
        connection_id: Connection ID
        stream_name: Name of the stream
        seq: Sequence number

    Returns:
        Message with metadata
    """
    conn_info = await get_connection(connection_id)

    try:
        message = await MessageService.get_message(conn_info, stream_name, seq)
        return message

    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message {seq} not found in stream '{stream_name}'",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get message: {str(e)}",
        ) from e


@router.post(
    "/connections/{connection_id}/streams/{stream_name}/messages/{seq}/replay",
    response_model=MessageReplayResponse,
)
async def replay_message(
    connection_id: str,
    stream_name: str,
    seq: int,
    request: MessageReplayRequest,
    http_request: Request,
    _: None = Depends(require_admin),
):
    """Replay a message to a target subject (DLQ retry workflow)."""
    conn_info = await get_connection(connection_id)
    try:
        result = await MessageService.replay_message(
            conn_info,
            stream_name=stream_name,
            seq=seq,
            target_subject=request.target_subject,
            copy_headers=request.copy_headers,
            extra_headers=request.extra_headers,
        )
        audit_action(
            http_request, "replay_message", "message", stream_name,
            connection_id, details={"seq": seq, "target": request.target_subject},
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to replay message: {str(e)}",
        ) from e


@router.post(
    "/connections/{connection_id}/streams/{stream_name}/messages/index/build",
)
async def build_message_index(
    connection_id: str,
    stream_name: str,
    request: MessageIndexBuildRequest,
    _: None = Depends(require_admin),
):
    """Build or refresh in-memory message index for faster search."""
    conn_info = await get_connection(connection_id)
    try:
        return await MessageService.build_search_index(conn_info, stream_name, limit=request.limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build index: {str(e)}",
        ) from e


@router.get(
    "/connections/{connection_id}/streams/{stream_name}/messages/index/search",
    response_model=MessageIndexSearchResponse,
)
async def search_message_index(
    connection_id: str,
    stream_name: str,
    query: str = Query(..., min_length=1),
    limit: int = Query(100, ge=1, le=500),
):
    """Search cached message index."""
    conn_info = await get_connection(connection_id)
    try:
        return await MessageService.search_index(conn_info, stream_name, query=query, limit=limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search index: {str(e)}",
        ) from e


@router.post(
    "/connections/{connection_id}/messages/validate-schema",
    response_model=SchemaValidationResponse,
)
async def validate_schema(
    connection_id: str,
    request: SchemaValidationRequest,
):
    """Validate payload against basic JSON schema subset."""
    # Ensure connection exists for session scoping and RBAC behavior consistency.
    await get_connection(connection_id)
    return MessageService.validate_schema(schema=request.schema, payload=request.payload)
