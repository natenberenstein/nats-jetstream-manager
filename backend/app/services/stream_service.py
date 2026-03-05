"""Service for managing NATS JetStream streams."""

from loguru import logger
from typing import Any

from nats.js import api
from nats.js.api import DiscardPolicy as NatsDiscardPolicy
from nats.js.api import RetentionPolicy as NatsRetentionPolicy
from nats.js.api import StorageType as NatsStorageType
from nats.js.api import StreamConfig as NatsStreamConfig
from nats.js.errors import NotFoundError

from app.core.connection_manager import ConnectionInfo
from app.models.schemas import StreamCreateRequest, StreamUpdateRequest




class StreamService:
    """Service for stream operations."""

    @staticmethod
    def _stream_info_to_dict(stream_info: api.StreamInfo) -> dict[str, Any]:
        state = stream_info.state
        first_ts = getattr(state, "first_ts", None)
        last_ts = getattr(state, "last_ts", None)
        created = getattr(stream_info, "created", None)
        return {
            "config": {
                "name": stream_info.config.name,
                "subjects": (
                    list(stream_info.config.subjects) if stream_info.config.subjects else []
                ),
                "retention": (
                    stream_info.config.retention if stream_info.config.retention else "limits"
                ),
                "storage": (stream_info.config.storage if stream_info.config.storage else "file"),
                "max_consumers": stream_info.config.max_consumers,
                "max_msgs": stream_info.config.max_msgs,
                "max_bytes": stream_info.config.max_bytes,
                "max_age": stream_info.config.max_age,
                "max_msg_size": stream_info.config.max_msg_size,
                "discard": (stream_info.config.discard if stream_info.config.discard else "old"),
                "duplicate_window": stream_info.config.duplicate_window,
                "replicas": stream_info.config.num_replicas,
                "no_ack": stream_info.config.no_ack,
                "description": stream_info.config.description,
            },
            "state": {
                "messages": state.messages,
                "bytes": state.bytes,
                "first_seq": state.first_seq,
                "last_seq": state.last_seq,
                "consumer_count": state.consumer_count,
                "first_ts": first_ts.isoformat() if first_ts else None,
                "last_ts": last_ts.isoformat() if last_ts else None,
            },
            "created": created.isoformat() if created else None,
        }

    @staticmethod
    async def list_streams(conn_info: ConnectionInfo) -> list[dict[str, Any]]:
        """
        List all streams.

        Args:
            conn_info: Connection information

        Returns:
            List of stream information dictionaries
        """
        try:
            streams_info = []
            for stream_name in await conn_info.js.streams_info():
                stream_dict = StreamService._stream_info_to_dict(stream_name)
                streams_info.append(stream_dict)

            logger.info(f"Listed {len(streams_info)} streams")
            return streams_info

        except Exception as e:
            logger.error(f"Error listing streams: {e}")
            raise

    @staticmethod
    async def get_stream(conn_info: ConnectionInfo, stream_name: str) -> dict[str, Any]:
        """
        Get stream information.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream

        Returns:
            Stream information dictionary

        Raises:
            NotFoundError: If stream doesn't exist
        """
        try:
            stream_info = await conn_info.js.stream_info(stream_name)
            stream_dict = StreamService._stream_info_to_dict(stream_info)

            logger.info(f"Retrieved stream info for {stream_name}")
            return stream_dict

        except NotFoundError:
            logger.error(f"Stream {stream_name} not found")
            raise
        except Exception as e:
            logger.error(f"Error getting stream {stream_name}: {e}")
            raise

    @staticmethod
    async def create_stream(
        conn_info: ConnectionInfo, stream_config: StreamCreateRequest
    ) -> dict[str, Any]:
        """
        Create a new stream.

        Args:
            conn_info: Connection information
            stream_config: Stream configuration

        Returns:
            Created stream information

        Raises:
            BadRequestError: If stream config is invalid
        """
        try:
            # Build NATS stream config
            config = NatsStreamConfig(
                name=stream_config.name,
                subjects=stream_config.subjects,
                retention=(
                    NatsRetentionPolicy(stream_config.retention.value)
                    if stream_config.retention
                    else NatsRetentionPolicy.LIMITS
                ),
                storage=(
                    NatsStorageType(stream_config.storage.value)
                    if stream_config.storage
                    else NatsStorageType.FILE
                ),
                max_consumers=stream_config.max_consumers if stream_config.max_consumers else -1,
                max_msgs=stream_config.max_msgs if stream_config.max_msgs else -1,
                max_bytes=stream_config.max_bytes if stream_config.max_bytes else -1,
                max_age=stream_config.max_age if stream_config.max_age else 0,
                max_msg_size=stream_config.max_msg_size if stream_config.max_msg_size else -1,
                discard=(
                    NatsDiscardPolicy(stream_config.discard.value)
                    if stream_config.discard
                    else NatsDiscardPolicy.OLD
                ),
                duplicate_window=(
                    stream_config.duplicate_window if stream_config.duplicate_window else 0
                ),
                num_replicas=stream_config.replicas if stream_config.replicas else 1,
                no_ack=stream_config.no_ack if stream_config.no_ack is not None else False,
                description=stream_config.description,
            )

            stream_info = await conn_info.js.add_stream(config)
            stream_dict = StreamService._stream_info_to_dict(stream_info)

            logger.info(f"Created stream {stream_config.name}")
            return stream_dict

        except Exception as e:
            logger.error(f"Error creating stream {stream_config.name}: {e}")
            raise

    @staticmethod
    async def update_stream(
        conn_info: ConnectionInfo, stream_name: str, update_config: StreamUpdateRequest
    ) -> dict[str, Any]:
        """
        Update an existing stream.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            update_config: Updated configuration

        Returns:
            Updated stream information

        Raises:
            NotFoundError: If stream doesn't exist
        """
        try:
            # Get current config
            current_info = await conn_info.js.stream_info(stream_name)
            current_config = current_info.config

            # Update only provided fields
            if update_config.subjects is not None:
                current_config.subjects = update_config.subjects
            if update_config.max_consumers is not None:
                current_config.max_consumers = update_config.max_consumers
            if update_config.max_msgs is not None:
                current_config.max_msgs = update_config.max_msgs
            if update_config.max_bytes is not None:
                current_config.max_bytes = update_config.max_bytes
            if update_config.max_age is not None:
                current_config.max_age = update_config.max_age
            if update_config.max_msg_size is not None:
                current_config.max_msg_size = update_config.max_msg_size
            if update_config.discard is not None:
                current_config.discard = NatsDiscardPolicy(update_config.discard.value)
            if update_config.description is not None:
                current_config.description = update_config.description

            # Update stream
            stream_info = await conn_info.js.update_stream(current_config)
            stream_dict = StreamService._stream_info_to_dict(stream_info)

            logger.info(f"Updated stream {stream_name}")
            return stream_dict

        except NotFoundError:
            logger.error(f"Stream {stream_name} not found")
            raise
        except Exception as e:
            logger.error(f"Error updating stream {stream_name}: {e}")
            raise

    @staticmethod
    async def delete_stream(conn_info: ConnectionInfo, stream_name: str) -> bool:
        """
        Delete a stream.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If stream doesn't exist
        """
        try:
            await conn_info.js.delete_stream(stream_name)
            logger.info(f"Deleted stream {stream_name}")
            return True

        except NotFoundError:
            logger.error(f"Stream {stream_name} not found")
            raise
        except Exception as e:
            logger.error(f"Error deleting stream {stream_name}: {e}")
            raise

    @staticmethod
    async def purge_stream(conn_info: ConnectionInfo, stream_name: str) -> bool:
        """
        Purge all messages from a stream.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream

        Returns:
            True if purged successfully

        Raises:
            NotFoundError: If stream doesn't exist
        """
        try:
            await conn_info.js.purge_stream(stream_name)
            logger.info(f"Purged stream {stream_name}")
            return True

        except NotFoundError:
            logger.error(f"Stream {stream_name} not found")
            raise
        except Exception as e:
            logger.error(f"Error purging stream {stream_name}: {e}")
            raise
