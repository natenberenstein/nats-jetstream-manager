"""Service for managing NATS JetStream consumers."""

from datetime import datetime, timezone
from loguru import logger
from typing import Any

from nats.js.api import AckPolicy as NatsAckPolicy
from nats.js.api import ConsumerConfig as NatsConsumerConfig
from nats.js.api import ConsumerInfo as NatsConsumerInfo
from nats.js.api import DeliverPolicy as NatsDeliverPolicy
from nats.js.api import ReplayPolicy as NatsReplayPolicy
from nats.js.errors import NotFoundError

from app.core.connection_manager import ConnectionInfo
from app.models.schemas import AckPolicy as SchemaAckPolicy
from app.models.schemas import ConsumerCreateRequest
from app.models.schemas import DeliverPolicy as SchemaDeliverPolicy
from app.models.schemas import ReplayPolicy as SchemaReplayPolicy




class ConsumerService:
    """Service for consumer operations."""

    @staticmethod
    def _to_nats_deliver_policy(
        policy: SchemaDeliverPolicy | None,
    ) -> NatsDeliverPolicy:
        return NatsDeliverPolicy(policy.value) if policy else NatsDeliverPolicy.ALL

    @staticmethod
    def _to_nats_ack_policy(policy: SchemaAckPolicy | None) -> NatsAckPolicy:
        return NatsAckPolicy(policy.value) if policy else NatsAckPolicy.EXPLICIT

    @staticmethod
    def _to_nats_replay_policy(
        policy: SchemaReplayPolicy | None,
    ) -> NatsReplayPolicy:
        return NatsReplayPolicy(policy.value) if policy else NatsReplayPolicy.INSTANT

    @staticmethod
    def _consumer_to_dict(consumer_info: NatsConsumerInfo) -> dict[str, Any]:
        """Convert nats-py ConsumerInfo to API response shape."""
        ack_wait_ns = (
            int(consumer_info.config.ack_wait * 1_000_000_000)
            if consumer_info.config.ack_wait is not None
            else None
        )

        return {
            "stream_name": consumer_info.stream_name,
            "name": consumer_info.name,
            # nats-py ConsumerInfo dataclass currently does not expose "created"
            "created": None,
            "config": {
                "durable_name": consumer_info.config.durable_name,
                "description": consumer_info.config.description,
                "deliver_policy": (
                    consumer_info.config.deliver_policy
                    if consumer_info.config.deliver_policy
                    else "all"
                ),
                "opt_start_seq": consumer_info.config.opt_start_seq,
                "opt_start_time": consumer_info.config.opt_start_time,
                "ack_policy": (
                    consumer_info.config.ack_policy
                    if consumer_info.config.ack_policy
                    else "explicit"
                ),
                "ack_wait": ack_wait_ns,
                "max_deliver": consumer_info.config.max_deliver,
                "filter_subject": consumer_info.config.filter_subject,
                "replay_policy": (
                    consumer_info.config.replay_policy
                    if consumer_info.config.replay_policy
                    else "instant"
                ),
                "sample_freq": consumer_info.config.sample_freq,
                "rate_limit_bps": consumer_info.config.rate_limit_bps,
                "max_ack_pending": consumer_info.config.max_ack_pending,
                "max_waiting": consumer_info.config.max_waiting,
                "headers_only": consumer_info.config.headers_only,
            },
            "delivered": {
                "consumer_seq": (
                    consumer_info.delivered.consumer_seq if consumer_info.delivered else 0
                ),
                "stream_seq": (
                    consumer_info.delivered.stream_seq if consumer_info.delivered else 0
                ),
            },
            "ack_floor": {
                "consumer_seq": (
                    consumer_info.ack_floor.consumer_seq if consumer_info.ack_floor else 0
                ),
                "stream_seq": (
                    consumer_info.ack_floor.stream_seq if consumer_info.ack_floor else 0
                ),
            },
            "num_pending": consumer_info.num_pending or 0,
            "num_waiting": consumer_info.num_waiting or 0,
            "num_ack_pending": consumer_info.num_ack_pending or 0,
        }

    @staticmethod
    async def list_consumers(conn_info: ConnectionInfo, stream_name: str) -> list[dict[str, Any]]:
        """
        List all consumers for a stream.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream

        Returns:
            List of consumer information dictionaries
        """
        try:
            consumers = await conn_info.js.consumers_info(stream_name)
            consumers_info = [ConsumerService._consumer_to_dict(consumer) for consumer in consumers]

            logger.info(f"Listed {len(consumers_info)} consumers for stream {stream_name}")
            return consumers_info

        except Exception as e:
            logger.error(f"Error listing consumers for stream {stream_name}: {e}")
            raise

    @staticmethod
    async def get_consumer(
        conn_info: ConnectionInfo, stream_name: str, consumer_name: str
    ) -> dict[str, Any]:
        """
        Get consumer information.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            consumer_name: Name of the consumer

        Returns:
            Consumer information dictionary

        Raises:
            NotFoundError: If consumer doesn't exist
        """
        try:
            consumer_info = await conn_info.js.consumer_info(stream_name, consumer_name)
            consumer_dict = ConsumerService._consumer_to_dict(consumer_info)

            logger.info(f"Retrieved consumer info for {consumer_name} on stream {stream_name}")
            return consumer_dict

        except NotFoundError:
            logger.error(f"Consumer {consumer_name} not found on stream {stream_name}")
            raise
        except Exception as e:
            logger.error(f"Error getting consumer {consumer_name} on stream {stream_name}: {e}")
            raise

    @staticmethod
    async def create_consumer(
        conn_info: ConnectionInfo, stream_name: str, consumer_config: ConsumerCreateRequest
    ) -> dict[str, Any]:
        """
        Create a new consumer.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            consumer_config: Consumer configuration

        Returns:
            Created consumer information

        Raises:
            BadRequestError: If consumer config is invalid
        """
        try:
            ack_wait_seconds = (
                consumer_config.ack_wait / 1_000_000_000
                if consumer_config.ack_wait is not None
                else 30.0
            )

            # Build NATS consumer config
            config = NatsConsumerConfig(
                durable_name=consumer_config.durable_name or consumer_config.name,
                description=consumer_config.description,
                deliver_policy=ConsumerService._to_nats_deliver_policy(
                    consumer_config.deliver_policy
                ),
                opt_start_seq=consumer_config.opt_start_seq,
                ack_policy=ConsumerService._to_nats_ack_policy(consumer_config.ack_policy),
                ack_wait=ack_wait_seconds,
                max_deliver=(
                    consumer_config.max_deliver if consumer_config.max_deliver is not None else -1
                ),
                filter_subject=consumer_config.filter_subject,
                replay_policy=ConsumerService._to_nats_replay_policy(consumer_config.replay_policy),
                sample_freq=consumer_config.sample_freq,
                rate_limit_bps=consumer_config.rate_limit_bps,
                max_ack_pending=(
                    consumer_config.max_ack_pending
                    if consumer_config.max_ack_pending is not None
                    else 1000
                ),
                max_waiting=(
                    consumer_config.max_waiting if consumer_config.max_waiting is not None else 512
                ),
                headers_only=(
                    consumer_config.headers_only
                    if consumer_config.headers_only is not None
                    else False
                ),
            )

            consumer_info = await conn_info.js.add_consumer(stream_name, config)
            consumer_dict = ConsumerService._consumer_to_dict(consumer_info)

            logger.info(
                f"Created consumer {consumer_config.name or consumer_config.durable_name} on stream {stream_name}"
            )
            return consumer_dict

        except Exception as e:
            logger.error(f"Error creating consumer on stream {stream_name}: {e}")
            raise

    @staticmethod
    async def delete_consumer(
        conn_info: ConnectionInfo, stream_name: str, consumer_name: str
    ) -> bool:
        """
        Delete a consumer.

        Args:
            conn_info: Connection information
            stream_name: Name of the stream
            consumer_name: Name of the consumer

        Returns:
            True if deleted successfully

        Raises:
            NotFoundError: If consumer doesn't exist
        """
        try:
            await conn_info.js.delete_consumer(stream_name, consumer_name)
            logger.info(f"Deleted consumer {consumer_name} from stream {stream_name}")
            return True

        except NotFoundError:
            logger.error(f"Consumer {consumer_name} not found on stream {stream_name}")
            raise
        except Exception as e:
            logger.error(f"Error deleting consumer {consumer_name} from stream {stream_name}: {e}")
            raise

    @staticmethod
    async def get_consumer_analytics(
        conn_info: ConnectionInfo, stream_name: str
    ) -> dict[str, Any]:
        """Compute lag and backlog analytics for all consumers on a stream."""
        consumers = await conn_info.js.consumers_info(stream_name)

        metrics: list[dict[str, Any]] = []
        total_pending = 0
        total_ack_pending = 0
        max_stream_lag = 0

        for consumer in consumers:
            delivered_stream_seq = (
                consumer.delivered.stream_seq if consumer.delivered else 0
            )
            ack_floor_stream_seq = (
                consumer.ack_floor.stream_seq if consumer.ack_floor else 0
            )
            stream_lag = max(0, delivered_stream_seq - ack_floor_stream_seq)
            unacked_span = max(0, (consumer.num_ack_pending or 0))

            total_pending += consumer.num_pending or 0
            total_ack_pending += consumer.num_ack_pending or 0
            max_stream_lag = max(max_stream_lag, stream_lag)

            ack_wait_ns = (
                int(consumer.config.ack_wait * 1_000_000_000)
                if consumer.config.ack_wait is not None
                else None
            )

            metrics.append(
                {
                    "name": consumer.name,
                    "stream_name": stream_name,
                    "num_pending": consumer.num_pending or 0,
                    "num_ack_pending": consumer.num_ack_pending or 0,
                    "num_waiting": consumer.num_waiting or 0,
                    "stream_lag": stream_lag,
                    "unacked_span": unacked_span,
                    "ack_wait_ns": ack_wait_ns,
                }
            )

        metrics.sort(key=lambda c: (c["stream_lag"], c["num_pending"]), reverse=True)
        return {
            "stream_name": stream_name,
            "total_consumers": len(metrics),
            "total_pending": total_pending,
            "total_ack_pending": total_ack_pending,
            "max_stream_lag": max_stream_lag,
            "consumers": metrics,
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
