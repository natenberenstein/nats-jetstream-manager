"""Pydantic schemas for request/response models."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ============================================================================
# Enums
# ============================================================================

class StorageType(str, Enum):
    """Stream storage type."""
    FILE = "file"
    MEMORY = "memory"


class RetentionPolicy(str, Enum):
    """Stream retention policy."""
    LIMITS = "limits"
    INTEREST = "interest"
    WORKQUEUE = "workqueue"


class DiscardPolicy(str, Enum):
    """Stream discard policy when limits are reached."""
    OLD = "old"
    NEW = "new"


class AckPolicy(str, Enum):
    """Consumer acknowledgment policy."""
    EXPLICIT = "explicit"
    ALL = "all"
    NONE = "none"


class DeliverPolicy(str, Enum):
    """Consumer deliver policy."""
    ALL = "all"
    LAST = "last"
    NEW = "new"
    BY_START_SEQUENCE = "by_start_sequence"
    BY_START_TIME = "by_start_time"
    LAST_PER_SUBJECT = "last_per_subject"


class ReplayPolicy(str, Enum):
    """Consumer replay policy."""
    INSTANT = "instant"
    ORIGINAL = "original"


# ============================================================================
# Connection Models
# ============================================================================

class ConnectionRequest(BaseModel):
    """Request to create a NATS connection."""
    url: str = Field(..., description="NATS server URL")
    user: Optional[str] = Field(None, description="Username")
    password: Optional[str] = Field(None, description="Password")
    token: Optional[str] = Field(None, description="Authentication token")


class ConnectionResponse(BaseModel):
    """Response after creating a connection."""
    connection_id: str
    status: str
    url: str


class ConnectionTestResponse(BaseModel):
    """Response from connection test."""
    success: bool
    connected: Optional[bool] = None
    jetstream_enabled: bool
    server_info: Dict[str, Any] = {}
    error: Optional[str] = None


class ConnectionStatusResponse(BaseModel):
    """Connection status information."""
    connected: bool
    jetstream_enabled: Optional[bool] = None
    url: Optional[str] = None
    created_at: Optional[str] = None
    last_accessed: Optional[str] = None
    error: Optional[str] = None


class ConnectionListItem(BaseModel):
    connection_id: str
    url: str
    connected: bool
    jetstream_enabled: bool
    created_at: Optional[str] = None
    last_accessed: Optional[str] = None


class ConnectionListResponse(BaseModel):
    connections: List[ConnectionListItem]
    total: int


# ============================================================================
# Auth & User Models
# ============================================================================

class UserProfile(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool = True
    created_at: str
    updated_at: str


class SignUpRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthSessionResponse(BaseModel):
    token: str
    expires_at: str
    user: UserProfile


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None


class InviteCreateRequest(BaseModel):
    email: str
    role: str = Field("viewer", description="admin or viewer")
    cluster_name: Optional[str] = None
    expires_hours: Optional[int] = None


class InviteAcceptRequest(BaseModel):
    token: str
    password: str
    full_name: Optional[str] = None


class InviteInfo(BaseModel):
    id: int
    email: str
    role: str
    token: str
    invited_by_user_id: Optional[int] = None
    cluster_name: Optional[str] = None
    status: str
    expires_at: str
    accepted_at: Optional[str] = None
    created_at: str
    invite_url: Optional[str] = None


class UpdateUserRoleRequest(BaseModel):
    role: str = Field(..., description="admin or viewer")


# ============================================================================
# Cluster Models
# ============================================================================

class ClusterNodeInfo(BaseModel):
    """High-level node health info derived from stream replica placement."""
    name: str
    role: Optional[str] = None
    current: Optional[bool] = None
    offline: Optional[bool] = None
    lag: Optional[int] = None
    active: Optional[int] = None
    version: Optional[str] = None


class ClusterLimits(BaseModel):
    """JetStream account limit summary."""
    max_memory: Optional[int] = None
    max_storage: Optional[int] = None
    max_streams: Optional[int] = None
    max_consumers: Optional[int] = None
    max_ack_pending: Optional[int] = None
    memory_max_stream_bytes: Optional[int] = None
    storage_max_stream_bytes: Optional[int] = None


class ClusterStreamHealth(BaseModel):
    """Replica health for a single stream."""
    stream: str
    replicas: int
    leader: Optional[str] = None
    replicas_seen: int = 0
    online_replicas: int = 0
    has_quorum: bool = True
    offline_replicas: int = 0
    lagging_replicas: int = 0
    healthy: bool = True


class ClusterOverviewResponse(BaseModel):
    """Cluster overview for dashboard presentation."""
    topology: str
    cluster_name: Optional[str] = None
    connected_server: Optional[str] = None
    server_version: Optional[str] = None
    mixed_versions: bool = False
    node_count: int = 0
    discovered_servers: List[str] = Field(default_factory=list)
    configured_servers: List[str] = Field(default_factory=list)
    route_count: int = 0
    gateway_count: int = 0
    leafnode_count: int = 0
    nodes: List[ClusterNodeInfo] = Field(default_factory=list)
    stream_count: int = 0
    consumer_count: int = 0
    messages: int = 0
    bytes: int = 0
    js_domain: Optional[str] = None
    js_api_total: Optional[int] = None
    js_api_errors: Optional[int] = None
    limits: Optional[ClusterLimits] = None
    confidence: str = "medium"
    sources: List[str] = Field(default_factory=list)
    caveats: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    quorum_degraded_streams: int = 0
    leaderless_streams: int = 0
    stream_health: List[ClusterStreamHealth] = Field(default_factory=list)
    generated_at: str


class JobCreateRequest(BaseModel):
    """Generic job create request."""
    job_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class IndexBuildJobRequest(BaseModel):
    """Request to run background index build for a stream."""
    stream_name: str
    limit: int = Field(2000, ge=100, le=10000)


class JobInfo(BaseModel):
    """Background job status."""
    id: str
    connection_id: Optional[str] = None
    job_type: str
    status: str
    progress: float = 0
    current: Optional[int] = None
    total: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    result: Optional[Dict[str, Any]] = None
    cancel_requested: bool = False
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class JobListResponse(BaseModel):
    jobs: List[JobInfo]
    total: int


# ============================================================================
# Stream Models
# ============================================================================

class StreamConfig(BaseModel):
    """Stream configuration."""
    name: str = Field(..., description="Stream name")
    subjects: List[str] = Field(..., description="Subject patterns")
    storage: StorageType = Field(StorageType.FILE, description="Storage type")
    retention: RetentionPolicy = Field(RetentionPolicy.LIMITS, description="Retention policy")
    max_consumers: int = Field(-1, description="Maximum number of consumers (-1 = unlimited)")
    max_msgs: int = Field(-1, description="Maximum number of messages (-1 = unlimited)")
    max_bytes: int = Field(-1, description="Maximum storage size in bytes (-1 = unlimited)")
    max_age: int = Field(0, description="Maximum age of messages in nanoseconds (0 = unlimited)")
    max_msg_size: int = Field(-1, description="Maximum message size (-1 = unlimited)")
    discard: DiscardPolicy = Field(DiscardPolicy.OLD, description="Discard policy")
    duplicate_window: int = Field(0, description="Duplicate detection window in nanoseconds")
    replicas: int = Field(1, description="Number of replicas")
    no_ack: bool = Field(False, description="Disable acknowledgments")
    description: Optional[str] = Field(None, description="Stream description")


class StreamState(BaseModel):
    """Stream state information."""
    messages: int = Field(..., description="Number of messages")
    bytes: int = Field(..., description="Total bytes")
    first_seq: int = Field(..., description="First sequence number")
    last_seq: int = Field(..., description="Last sequence number")
    consumer_count: int = Field(..., description="Number of consumers")
    first_ts: Optional[str] = Field(None, description="First message timestamp")
    last_ts: Optional[str] = Field(None, description="Last message timestamp")


class StreamInfo(BaseModel):
    """Complete stream information."""
    config: Dict[str, Any]
    state: StreamState
    created: str

    class Config:
        from_attributes = True


class StreamListResponse(BaseModel):
    """Response with list of streams."""
    streams: List[Dict[str, Any]]
    total: int


class StreamCreateRequest(BaseModel):
    """Request to create a stream."""
    name: str
    subjects: List[str]
    storage: Optional[StorageType] = StorageType.FILE
    retention: Optional[RetentionPolicy] = RetentionPolicy.LIMITS
    max_consumers: Optional[int] = -1
    max_msgs: Optional[int] = -1
    max_bytes: Optional[int] = -1
    max_age: Optional[int] = 0
    max_msg_size: Optional[int] = -1
    discard: Optional[DiscardPolicy] = DiscardPolicy.OLD
    duplicate_window: Optional[int] = 0
    replicas: Optional[int] = 1
    no_ack: Optional[bool] = False
    description: Optional[str] = None


class StreamUpdateRequest(BaseModel):
    """Request to update a stream."""
    subjects: Optional[List[str]] = None
    max_consumers: Optional[int] = None
    max_msgs: Optional[int] = None
    max_bytes: Optional[int] = None
    max_age: Optional[int] = None
    max_msg_size: Optional[int] = None
    discard: Optional[DiscardPolicy] = None
    description: Optional[str] = None


class StreamDeleteResponse(BaseModel):
    """Response after deleting a stream."""
    success: bool
    deleted_stream: str


class StreamPurgeResponse(BaseModel):
    """Response after purging a stream."""
    success: bool
    purged: bool


# ============================================================================
# Consumer Models
# ============================================================================

class ConsumerConfig(BaseModel):
    """Consumer configuration."""
    name: Optional[str] = Field(None, description="Consumer name (durable)")
    durable_name: Optional[str] = Field(None, description="Durable name")
    description: Optional[str] = Field(None, description="Consumer description")
    deliver_policy: DeliverPolicy = Field(DeliverPolicy.ALL, description="Deliver policy")
    opt_start_seq: Optional[int] = Field(None, description="Optional start sequence")
    opt_start_time: Optional[str] = Field(None, description="Optional start time")
    ack_policy: AckPolicy = Field(AckPolicy.EXPLICIT, description="Acknowledgment policy")
    ack_wait: int = Field(30_000_000_000, description="Ack wait time in nanoseconds")
    max_deliver: int = Field(-1, description="Maximum delivery attempts (-1 = unlimited)")
    filter_subject: Optional[str] = Field(None, description="Filter by subject")
    replay_policy: ReplayPolicy = Field(ReplayPolicy.INSTANT, description="Replay policy")
    sample_freq: Optional[str] = Field(None, description="Sampling frequency")
    rate_limit_bps: Optional[int] = Field(None, description="Rate limit in bits per second")
    max_ack_pending: int = Field(1000, description="Maximum pending acks")
    max_waiting: int = Field(512, description="Maximum waiting pull requests")
    headers_only: bool = Field(False, description="Deliver only headers")


class ConsumerInfo(BaseModel):
    """Consumer information."""
    stream_name: str
    name: str
    created: str
    config: Dict[str, Any]
    delivered: Dict[str, Any]
    ack_floor: Dict[str, Any]
    num_pending: int
    num_waiting: int
    num_ack_pending: int


class ConsumerListResponse(BaseModel):
    """Response with list of consumers."""
    consumers: List[Dict[str, Any]]
    total: int


class ConsumerCreateRequest(BaseModel):
    """Request to create a consumer."""
    name: Optional[str] = None
    durable_name: Optional[str] = None
    description: Optional[str] = None
    deliver_policy: Optional[DeliverPolicy] = DeliverPolicy.ALL
    opt_start_seq: Optional[int] = None
    opt_start_time: Optional[str] = None
    ack_policy: Optional[AckPolicy] = AckPolicy.EXPLICIT
    ack_wait: Optional[int] = 30_000_000_000
    max_deliver: Optional[int] = -1
    filter_subject: Optional[str] = None
    replay_policy: Optional[ReplayPolicy] = ReplayPolicy.INSTANT
    sample_freq: Optional[str] = None
    rate_limit_bps: Optional[int] = None
    max_ack_pending: Optional[int] = 1000
    max_waiting: Optional[int] = 512
    headers_only: Optional[bool] = False


class ConsumerDeleteResponse(BaseModel):
    """Response after deleting a consumer."""
    success: bool
    deleted_consumer: str


class ConsumerLagMetrics(BaseModel):
    """Lag and backlog metrics for a consumer."""
    name: str
    stream_name: str
    num_pending: int
    num_ack_pending: int
    num_waiting: int
    stream_lag: int
    unacked_span: int
    ack_wait_ns: Optional[int] = None


class ConsumerAnalyticsResponse(BaseModel):
    """Aggregated analytics for consumers of a stream."""
    stream_name: str
    total_consumers: int
    total_pending: int
    total_ack_pending: int
    max_stream_lag: int
    consumers: List[ConsumerLagMetrics]
    generated_at: str


# ============================================================================
# Message Models
# ============================================================================

class MessagePublishRequest(BaseModel):
    """Request to publish a message."""
    subject: str = Field(..., description="Subject to publish to")
    data: Any = Field(..., description="Message data (will be JSON encoded)")
    headers: Optional[Dict[str, str]] = Field(None, description="Message headers")


class MessagePublishResponse(BaseModel):
    """Response after publishing a message."""
    stream: str
    seq: int
    duplicate: bool = False


class MessageBatchPublishRequest(BaseModel):
    """Request to publish multiple messages."""
    subject: str = Field(..., description="Subject to publish to")
    messages: List[Any] = Field(..., description="List of message data")
    headers: Optional[Dict[str, str]] = Field(None, description="Headers to apply to all messages")


class MessageBatchPublishResponse(BaseModel):
    """Response after batch publishing."""
    published: int
    results: List[MessagePublishResponse]


class MessageData(BaseModel):
    """Message data and metadata."""
    subject: str
    seq: int
    data: Optional[Any] = None
    data_preview: Optional[str] = None
    payload_size: Optional[int] = None
    headers: Optional[Dict[str, str]] = None
    time: Optional[str] = None


class MessagesResponse(BaseModel):
    """Response with list of messages."""
    messages: List[MessageData]
    total: int
    has_more: bool = False
    next_seq: Optional[int] = None


class MessageReplayRequest(BaseModel):
    """Replay a stream message to another subject."""
    target_subject: str
    copy_headers: bool = True
    extra_headers: Optional[Dict[str, str]] = None


class MessageReplayResponse(BaseModel):
    """Replay result."""
    source_stream: str
    source_seq: int
    target_subject: str
    published_stream: str
    published_seq: int


class MessageIndexBuildRequest(BaseModel):
    """Build/refresh in-memory message search index for a stream."""
    limit: int = Field(2000, ge=100, le=10000)


class IndexedMessageMatch(BaseModel):
    """Indexed message search result."""
    seq: int
    subject: str
    payload_preview: str
    headers: Optional[Dict[str, str]] = None


class MessageIndexSearchResponse(BaseModel):
    """Search response from in-memory index."""
    stream_name: str
    query: str
    total: int
    indexed_messages: int
    matches: List[IndexedMessageMatch]
    built_at: Optional[str] = None


class SchemaValidationRequest(BaseModel):
    """Validate payload against a basic JSON schema subset."""
    schema: Dict[str, Any]
    payload: Any


class SchemaValidationResponse(BaseModel):
    """Schema validation result."""
    valid: bool
    errors: List[str] = Field(default_factory=list)


# ============================================================================
# Health & Error Models
# ============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str


class ErrorResponse(BaseModel):
    """Error response."""
    detail: str
    error_type: Optional[str] = None


class SystemMetricPoint(BaseModel):
    """Simple named metric for UI charts/widgets."""
    name: str
    value: float


class SystemObservabilityResponse(BaseModel):
    """System-level observability snapshot."""
    connected: bool
    server_version: Optional[str] = None
    uptime_hint_seconds: Optional[int] = None
    streams: int
    consumers: int
    messages: int
    bytes: int
    js_api_total: Optional[int] = None
    js_api_errors: Optional[int] = None
    memory_used: Optional[int] = None
    storage_used: Optional[int] = None
    memory_limit: Optional[int] = None
    storage_limit: Optional[int] = None
    memory_utilization: Optional[float] = None
    storage_utilization: Optional[float] = None
    top_streams_by_bytes: List[SystemMetricPoint] = Field(default_factory=list)
    top_streams_by_messages: List[SystemMetricPoint] = Field(default_factory=list)
    generated_at: str
