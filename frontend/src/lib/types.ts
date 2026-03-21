/**
 * TypeScript types for NATS JetStream Manager
 */

// Connection types
export interface ConnectionRequest {
  url: string;
  user?: string;
  password?: string;
  token?: string;
}

export interface ConnectionResponse {
  connection_id: string;
  status: string;
  url: string;
}

export interface ConnectionStatus {
  connected: boolean;
  jetstream_enabled?: boolean;
  url?: string;
  created_at?: string;
  last_accessed?: string;
  error?: string;
}

export interface ConnectionListItem {
  connection_id: string;
  url: string;
  connected: boolean;
  jetstream_enabled: boolean;
  created_at?: string;
  last_accessed?: string;
}

export interface ClusterNodeInfo {
  name: string;
  role?: string;
  current?: boolean;
  offline?: boolean;
  lag?: number;
  active?: number;
  version?: string;
}

export interface ClusterLimits {
  max_memory?: number;
  max_storage?: number;
  max_streams?: number;
  max_consumers?: number;
  max_ack_pending?: number;
  memory_max_stream_bytes?: number;
  storage_max_stream_bytes?: number;
}

export interface ClusterStreamHealth {
  stream: string;
  replicas: number;
  leader?: string;
  replicas_seen: number;
  online_replicas: number;
  has_quorum: boolean;
  offline_replicas: number;
  lagging_replicas: number;
  healthy: boolean;
}

export interface ClusterOverview {
  topology: 'standalone' | 'clustered';
  cluster_name?: string;
  connected_server?: string;
  server_version?: string;
  mixed_versions: boolean;
  node_count: number;
  discovered_servers: string[];
  configured_servers: string[];
  route_count: number;
  gateway_count: number;
  leafnode_count: number;
  nodes: ClusterNodeInfo[];
  stream_count: number;
  consumer_count: number;
  messages: number;
  bytes: number;
  js_domain?: string;
  js_api_total?: number;
  js_api_errors?: number;
  limits?: ClusterLimits | null;
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
  caveats: string[];
  warnings: string[];
  quorum_degraded_streams: number;
  leaderless_streams: number;
  stream_health: ClusterStreamHealth[];
  generated_at: string;
}

export interface JobInfo {
  id: string;
  connection_id?: string | null;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current?: number | null;
  total?: number | null;
  message?: string | null;
  error?: string | null;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  cancel_requested: boolean;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

// Stream types
export interface StreamConfig {
  name: string;
  subjects: string[];
  storage?: 'file' | 'memory';
  retention?: 'limits' | 'interest' | 'workqueue';
  max_consumers?: number;
  max_msgs?: number;
  max_bytes?: number;
  max_age?: number;
  max_msg_size?: number;
  discard?: 'old' | 'new';
  duplicate_window?: number;
  replicas?: number;
  no_ack?: boolean;
  description?: string;
}

export interface StreamState {
  messages: number;
  bytes: number;
  first_seq: number;
  last_seq: number;
  consumer_count: number;
  first_ts?: string;
  last_ts?: string;
}

export interface StreamInfo {
  config: StreamConfig;
  state: StreamState;
  created: string;
}

// Consumer types
export interface ConsumerConfig {
  name?: string;
  durable_name?: string;
  description?: string;
  deliver_policy?:
    | 'all'
    | 'last'
    | 'new'
    | 'by_start_sequence'
    | 'by_start_time'
    | 'last_per_subject';
  opt_start_seq?: number;
  opt_start_time?: string;
  ack_policy?: 'explicit' | 'all' | 'none';
  ack_wait?: number;
  max_deliver?: number;
  filter_subject?: string;
  deliver_subject?: string;
  deliver_group?: string;
  flow_control?: boolean;
  idle_heartbeat?: number;
  replay_policy?: 'instant' | 'original';
  sample_freq?: string;
  rate_limit_bps?: number;
  max_ack_pending?: number;
  max_waiting?: number;
  headers_only?: boolean;
}

export interface ConsumerInfo {
  stream_name: string;
  name: string;
  created: string;
  config: ConsumerConfig;
  delivered: {
    consumer_seq: number;
    stream_seq: number;
  };
  ack_floor: {
    consumer_seq: number;
    stream_seq: number;
  };
  num_pending: number;
  num_waiting: number;
  num_ack_pending: number;
}

export interface ConsumerLagMetric {
  name: string;
  stream_name: string;
  num_pending: number;
  num_ack_pending: number;
  num_waiting: number;
  stream_lag: number;
  unacked_span: number;
  ack_wait_ns?: number;
}

export interface ConsumerAnalytics {
  stream_name: string;
  total_consumers: number;
  total_pending: number;
  total_ack_pending: number;
  max_stream_lag: number;
  consumers: ConsumerLagMetric[];
  generated_at: string;
}

// Message types
export interface MessagePublishRequest {
  subject: string;
  data: unknown;
  headers?: Record<string, string>;
}

export interface MessagePublishResponse {
  stream: string;
  seq: number;
  duplicate: boolean;
}

export interface MessageData {
  subject: string;
  seq: number;
  data?: unknown;
  data_preview?: string;
  payload_size?: number;
  headers?: Record<string, string>;
  time?: string | null;
}

export interface MessagesResponse {
  messages: MessageData[];
  total: number;
  has_more?: boolean;
  next_seq?: number | null;
  first_seq?: number;
  last_seq?: number;
}

export interface MessageReplayRequest {
  target_subject: string;
  copy_headers?: boolean;
  extra_headers?: Record<string, string>;
}

export interface MessageReplayResponse {
  source_stream: string;
  source_seq: number;
  target_subject: string;
  published_stream: string;
  published_seq: number;
}

export interface IndexedMessageMatch {
  seq: number;
  subject: string;
  payload_preview: string;
  headers?: Record<string, string>;
}

export interface MessageIndexSearchResponse {
  stream_name: string;
  query: string;
  total: number;
  indexed_messages: number;
  matches: IndexedMessageMatch[];
  built_at?: string;
}

export interface SchemaValidationResponse {
  valid: boolean;
  errors: string[];
}

export interface SystemMetricPoint {
  name: string;
  value: number;
}

export interface SystemObservability {
  connected: boolean;
  server_version?: string;
  uptime_hint_seconds?: number;
  streams: number;
  consumers: number;
  messages: number;
  bytes: number;
  js_api_total?: number;
  js_api_errors?: number;
  memory_used?: number;
  storage_used?: number;
  memory_limit?: number;
  storage_limit?: number;
  memory_utilization?: number;
  storage_utilization?: number;
  top_streams_by_bytes: SystemMetricPoint[];
  top_streams_by_messages: SystemMetricPoint[];
  generated_at: string;
}

// Stream Metrics types
export interface StreamMetricPoint {
  stream_name: string;
  collected_at: string;
  messages: number;
  bytes: number;
  consumer_count: number;
  msg_rate: number;
  byte_rate: number;
}

export interface StreamMetricsResponse {
  stream_name: string;
  points: StreamMetricPoint[];
  window_minutes: number;
}

export interface StreamMetricsSummaryResponse {
  connection_id: string;
  streams: StreamMetricsResponse[];
  window_minutes: number;
}

// Connection Health types
export interface HealthCheckEntry {
  status: 'up' | 'down';
  jetstream_ok: boolean;
  error?: string | null;
  checked_at: string;
}

export interface HealthHistoryResponse {
  connection_id: string;
  checks: HealthCheckEntry[];
  window_hours: number;
}

export interface UptimeSummary {
  connection_id: string;
  total_checks: number;
  up_checks: number;
  down_checks: number;
  uptime_pct: number;
  last_status?: string | null;
  last_error?: string | null;
  last_checked_at?: string | null;
}

// Audit Log types
export interface AuditLogEntry {
  id: number;
  user_id?: number | null;
  user_email?: string | null;
  action: string;
  resource_type: string;
  resource_name?: string | null;
  connection_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}

// KV Store types
export interface KvStoreStatus {
  bucket: string;
  description: string;
  storage: string;
  replicas: number;
  history: number;
  max_bytes: number;
  ttl: number;
  values: number;
  size: number;
}

export interface KvEntryInfo {
  bucket: string;
  key: string;
  value: string;
  revision: number;
  created: string;
  operation: 'PUT' | 'DEL' | 'PURGE';
  length: number;
}

export interface KvCreateConfig {
  name: string;
  description?: string;
  storage?: 'file' | 'memory';
  history?: number;
  max_bytes?: number;
  ttl?: number;
  replicas?: number;
  max_value_size?: number;
}

// Object Store types
export interface ObjectStoreStatusInfo {
  bucket: string;
  description: string;
  storage: string;
  replicas: number;
  size: number;
  sealed: boolean;
  compression: boolean;
}

export interface ObjectInfoData {
  bucket: string;
  name: string;
  description?: string;
  size: number;
  chunks: number;
  digest: string;
  deleted: boolean;
  mtime: string;
  revision: number;
  nuid: string;
}

export interface ObjectStoreCreateConfig {
  name: string;
  description?: string;
  storage?: 'file' | 'memory';
  max_bytes?: number;
  replicas?: number;
  max_chunk_size?: number;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}
