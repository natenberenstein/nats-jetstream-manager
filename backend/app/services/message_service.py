"""Service for managing NATS JetStream messages."""

import json
import logging
from datetime import datetime, timezone
from fnmatch import fnmatch
from typing import Any, Awaitable, Callable

from nats.js.errors import NotFoundError

from app.core.connection_manager import ConnectionInfo
from app.models.schemas import MessageBatchPublishRequest, MessagePublishRequest

logger = logging.getLogger(__name__)


class MessageService:
    """Service for message operations."""

    _index_cache: dict[tuple[str, str], dict[str, Any]] = {}

    @staticmethod
    def _decode_message_data(data: bytes | None) -> Any:
        """Decode message payload as JSON when possible, otherwise string."""
        if data is None:
            return ""

        try:
            return json.loads(data.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return data.decode(errors="replace")

    @staticmethod
    def _extract_headers(raw_headers: dict | None) -> dict[str, str] | None:
        """Normalize message headers into a string-only dictionary."""
        if not raw_headers:
            return None

        headers: dict[str, str] = {}
        for key, value in raw_headers.items():
            headers[str(key)] = str(value)
        return headers or None

    @staticmethod
    def _preview_message_data(data: bytes | None, preview_bytes: int = 1024) -> str | None:
        """Build a small text preview for large payloads."""
        if data is None:
            return None

        clipped = data[:preview_bytes]
        preview = clipped.decode(errors="replace")
        if len(data) > preview_bytes:
            preview += "…"
        return preview

    @staticmethod
    async def publish_message(
        conn_info: ConnectionInfo, request: MessagePublishRequest
    ) -> dict[str, Any]:
        """
        Publish a message to a subject.

        Args:
            conn_info: Connection information
            request: Message publish request

        Returns:
            Publish acknowledgment with stream and sequence info
        """
        try:
            # Encode data as JSON if it's not already bytes
            if isinstance(request.data, (dict, list)):
                payload = json.dumps(request.data).encode()
            elif isinstance(request.data, str):
                payload = request.data.encode()
            else:
                payload = request.data

            # Publish with headers if provided
            if request.headers:
                ack = await conn_info.js.publish(request.subject, payload, headers=request.headers)
            else:
                ack = await conn_info.js.publish(request.subject, payload)

            result = {
                "stream": ack.stream,
                "seq": ack.seq,
                "duplicate": ack.duplicate if hasattr(ack, "duplicate") else False,
            }

            logger.info(f"Published message to {request.subject}, seq={ack.seq}")
            return result

        except Exception as e:
            logger.error(f"Error publishing message to {request.subject}: {e}")
            raise

    @staticmethod
    async def publish_batch(
        conn_info: ConnectionInfo, request: MessageBatchPublishRequest
    ) -> dict[str, Any]:
        """
        Publish multiple messages to a subject.

        Args:
            conn_info: Connection information
            request: Batch publish request

        Returns:
            Batch publish results
        """
        try:
            results = []

            for message_data in request.messages:
                # Encode data
                if isinstance(message_data, (dict, list)):
                    payload = json.dumps(message_data).encode()
                elif isinstance(message_data, str):
                    payload = message_data.encode()
                else:
                    payload = message_data

                # Publish with headers if provided
                if request.headers:
                    ack = await conn_info.js.publish(
                        request.subject, payload, headers=request.headers
                    )
                else:
                    ack = await conn_info.js.publish(request.subject, payload)

                results.append(
                    {
                        "stream": ack.stream,
                        "seq": ack.seq,
                        "duplicate": ack.duplicate if hasattr(ack, "duplicate") else False,
                    }
                )

            logger.info(f"Published {len(results)} messages to {request.subject}")
            return {"published": len(results), "results": results}

        except Exception as e:
            logger.error(f"Error publishing batch to {request.subject}: {e}")
            raise

    @staticmethod
    async def get_messages(
        conn_info: ConnectionInfo,
        stream_name: str,
        limit: int = 50,
        seq_start: int | None = None,
        seq_end: int | None = None,
        include_payload: bool = False,
        preview_bytes: int = 1024,
        from_latest: bool = False,
        filter_subject: str | None = None,
        header_key: str | None = None,
        header_value: str | None = None,
        payload_contains: str | None = None,
    ) -> dict[str, Any]:
        """
        Get messages from a stream.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            limit: Maximum number of messages to retrieve
            seq_start: Starting sequence number (optional)

        Returns:
            List of messages with metadata
        """
        try:
            messages = []

            # Get stream info to determine sequence range
            stream_info = await conn_info.js.stream_info(stream_name)

            if stream_info.state.messages == 0:
                return {
                    "messages": messages,
                    "total": 0,
                    "has_more": False,
                    "next_seq": None,
                }

            first_seq = stream_info.state.first_seq
            last_seq = stream_info.state.last_seq

            if from_latest and seq_start is None:
                start_seq = max(first_seq, last_seq - limit + 1)
            else:
                start_seq = seq_start if seq_start else first_seq

            end_bound = min(seq_end if seq_end else last_seq, last_seq)
            if start_seq > end_bound:
                return {
                    "messages": messages,
                    "total": 0,
                    "has_more": False,
                    "next_seq": None,
                }

            # Fetch messages
            last_scanned_seq = start_seq - 1
            payload_contains_normalized = payload_contains.lower() if payload_contains else None

            for seq in range(start_seq, end_bound + 1):
                last_scanned_seq = seq
                try:
                    msg = await conn_info.js.get_msg(stream_name, seq)

                    if filter_subject and msg.subject and not fnmatch(msg.subject, filter_subject):
                        continue

                    headers = MessageService._extract_headers(msg.headers)
                    if header_key:
                        header_actual = headers.get(header_key) if headers else None
                        if header_actual is None:
                            continue
                        if header_value is not None and header_actual != header_value:
                            continue

                    if payload_contains_normalized is not None:
                        payload_text = (msg.data or b"").decode(errors="replace").lower()
                        if payload_contains_normalized not in payload_text:
                            continue

                    payload_size = len(msg.data) if msg.data else 0
                    data = (
                        MessageService._decode_message_data(msg.data)
                        if include_payload
                        else None
                    )
                    data_preview = MessageService._preview_message_data(
                        msg.data, preview_bytes=preview_bytes
                    )

                    messages.append(
                        {
                            "subject": msg.subject,
                            "seq": msg.seq,
                            "data": data,
                            "data_preview": data_preview,
                            "payload_size": payload_size,
                            "headers": headers,
                            # nats-py RawStreamMsg does not expose a timestamp field.
                            "time": None,
                        }
                    )

                    if len(messages) >= limit:
                        break

                except NotFoundError:
                    # Message might have been deleted/purged
                    continue

            has_more = last_scanned_seq < end_bound
            next_seq = last_scanned_seq + 1 if has_more else None

            logger.info(f"Retrieved {len(messages)} messages from stream {stream_name}")
            return {
                "messages": messages,
                "total": len(messages),
                "has_more": has_more,
                "next_seq": next_seq,
            }

        except NotFoundError:
            logger.error(f"Stream {stream_name} not found")
            raise
        except Exception as e:
            logger.error(f"Error getting messages from stream {stream_name}: {e}")
            raise

    @staticmethod
    async def get_message(conn_info: ConnectionInfo, stream_name: str, seq: int) -> dict[str, Any]:
        """
        Get a specific message by sequence number.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            seq: Sequence number

        Returns:
            Message with metadata

        Raises:
            NotFoundError: If message doesn't exist
        """
        try:
            msg = await conn_info.js.get_msg(stream_name, seq)

            data = MessageService._decode_message_data(msg.data)
            headers = MessageService._extract_headers(msg.headers)

            message_dict = {
                "subject": msg.subject,
                "seq": msg.seq,
                "data": data,
                "data_preview": MessageService._preview_message_data(msg.data),
                "payload_size": len(msg.data) if msg.data else 0,
                "headers": headers,
                # nats-py RawStreamMsg does not expose a timestamp field.
                "time": None,
            }

            logger.info(f"Retrieved message {seq} from stream {stream_name}")
            return message_dict

        except NotFoundError:
            logger.error(f"Message {seq} not found in stream {stream_name}")
            raise
        except Exception as e:
            logger.error(f"Error getting message {seq} from stream {stream_name}: {e}")
            raise

    @staticmethod
    async def replay_message(
        conn_info: ConnectionInfo,
        stream_name: str,
        seq: int,
        target_subject: str,
        copy_headers: bool = True,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Replay a stream message to a target subject."""
        msg = await conn_info.js.get_msg(stream_name, seq)
        headers = MessageService._extract_headers(msg.headers) if copy_headers else {}
        merged_headers = {**(headers or {}), **(extra_headers or {})}

        ack = await conn_info.js.publish(
            target_subject,
            msg.data or b"",
            headers=merged_headers or None,
        )
        return {
            "source_stream": stream_name,
            "source_seq": seq,
            "target_subject": target_subject,
            "published_stream": ack.stream,
            "published_seq": ack.seq,
        }

    @staticmethod
    async def build_search_index(
        conn_info: ConnectionInfo,
        stream_name: str,
        limit: int = 2000,
        progress_callback: Callable[[int, int, str | None], Awaitable[None]] | None = None,
        cancel_check: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        """Build an in-memory index for fast payload/header search."""
        stream_info = await conn_info.js.stream_info(stream_name)
        if stream_info.state.messages == 0:
            key = (conn_info.connection_id, stream_name)
            MessageService._index_cache[key] = {
                "stream_name": stream_name,
                "built_at": datetime.now(tz=timezone.utc).isoformat(),
                "entries": [],
            }
            if progress_callback:
                await progress_callback(0, 0, "No messages to index")
            return {"stream_name": stream_name, "indexed_messages": 0}

        first_seq = stream_info.state.first_seq
        last_seq = stream_info.state.last_seq
        start_seq = max(first_seq, last_seq - limit + 1)
        entries: list[dict[str, Any]] = []

        total_to_scan = max(0, last_seq - start_seq + 1)
        scanned = 0
        for seq in range(start_seq, last_seq + 1):
            if cancel_check and cancel_check():
                raise RuntimeError("Index build cancelled")
            try:
                msg = await conn_info.js.get_msg(stream_name, seq)
            except NotFoundError:
                scanned += 1
                if progress_callback and (scanned % 25 == 0 or scanned == total_to_scan):
                    await progress_callback(scanned, total_to_scan, "Scanning stream")
                continue

            preview = MessageService._preview_message_data(msg.data, preview_bytes=4096) or ""
            headers = MessageService._extract_headers(msg.headers)
            header_text = " ".join(f"{k}:{v}" for k, v in (headers or {}).items()).lower()
            entries.append(
                {
                    "seq": msg.seq,
                    "subject": msg.subject or "",
                    "payload_preview": preview,
                    "payload_search": preview.lower(),
                    "header_search": header_text,
                    "headers": headers,
                }
            )
            scanned += 1
            if progress_callback and (scanned % 25 == 0 or scanned == total_to_scan):
                await progress_callback(scanned, total_to_scan, "Indexing messages")

        key = (conn_info.connection_id, stream_name)
        MessageService._index_cache[key] = {
            "stream_name": stream_name,
            "built_at": datetime.now(tz=timezone.utc).isoformat(),
            "entries": entries,
        }
        return {"stream_name": stream_name, "indexed_messages": len(entries)}

    @staticmethod
    async def search_index(
        conn_info: ConnectionInfo,
        stream_name: str,
        query: str,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Search the in-memory index."""
        key = (conn_info.connection_id, stream_name)
        if key not in MessageService._index_cache:
            await MessageService.build_search_index(conn_info, stream_name)

        index = MessageService._index_cache.get(key, {})
        entries = index.get("entries", [])
        q = query.lower().strip()

        matches = []
        for entry in entries:
            if (
                q in entry["subject"].lower()
                or q in entry["payload_search"]
                or q in entry["header_search"]
            ):
                matches.append(
                    {
                        "seq": entry["seq"],
                        "subject": entry["subject"],
                        "payload_preview": entry["payload_preview"],
                        "headers": entry["headers"],
                    }
                )
            if len(matches) >= limit:
                break

        return {
            "stream_name": stream_name,
            "query": query,
            "total": len(matches),
            "indexed_messages": len(entries),
            "matches": matches,
            "built_at": index.get("built_at"),
        }

    @staticmethod
    def _validate_json_schema_subset(
        schema: dict[str, Any], payload: Any, path: str = "$"
    ) -> list[str]:
        """Validate basic JSON schema subset (type, properties, required, items, enum)."""
        errors: list[str] = []
        expected_type = schema.get("type")

        type_checks = {
            "object": lambda v: isinstance(v, dict),
            "array": lambda v: isinstance(v, list),
            "string": lambda v: isinstance(v, str),
            "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
            "boolean": lambda v: isinstance(v, bool),
            "null": lambda v: v is None,
        }
        if expected_type in type_checks and not type_checks[expected_type](payload):
            errors.append(f"{path}: expected {expected_type}")
            return errors

        enum_values = schema.get("enum")
        if enum_values is not None and payload not in enum_values:
            errors.append(f"{path}: value not in enum")

        if expected_type == "object":
            required = schema.get("required", [])
            properties = schema.get("properties", {})
            for field in required:
                if field not in payload:
                    errors.append(f"{path}.{field}: required field missing")
            for field, subschema in properties.items():
                if field in payload and isinstance(subschema, dict):
                    errors.extend(
                        MessageService._validate_json_schema_subset(
                            subschema, payload[field], f"{path}.{field}"
                        )
                    )

        if expected_type == "array" and isinstance(payload, list):
            item_schema = schema.get("items")
            if isinstance(item_schema, dict):
                for idx, item in enumerate(payload):
                    errors.extend(
                        MessageService._validate_json_schema_subset(
                            item_schema, item, f"{path}[{idx}]"
                        )
                    )
        return errors

    @staticmethod
    def validate_schema(schema: dict[str, Any], payload: Any) -> dict[str, Any]:
        """Validate payload using supported JSON schema subset."""
        errors = MessageService._validate_json_schema_subset(schema, payload)
        return {"valid": len(errors) == 0, "errors": errors}
