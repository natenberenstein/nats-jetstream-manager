/**
 * API client for NATS JetStream Manager backend
 */

import {
  ConnectionRequest,
  ConnectionResponse,
  ConnectionStatus,
  ConnectionListItem,
  JobInfo,
  ClusterOverview,
  StreamConfig,
  StreamInfo,
  StreamMetricsResponse,
  StreamMetricsSummaryResponse,
  HealthHistoryResponse,
  UptimeSummary,
  ConsumerConfig,
  ConsumerInfo,
  ConsumerAnalytics,
  ConsumerDiagnosticsResponse,
  MessagePublishRequest,
  MessagePublishResponse,
  MessageReplayRequest,
  MessageReplayResponse,
  MessageData,
  MessageIndexSearchResponse,
  MessagesResponse,
  SchemaValidationResponse,
  SystemObservability,
  KvStoreStatus,
  KvEntryInfo,
  KvCreateConfig,
  ObjectStoreStatusInfo,
  ObjectInfoData,
  ObjectStoreCreateConfig,
  AuditListResult,
  ConsumerMetricsResponse,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_BASE = `${API_URL}/api/v1`;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, `Network error: ${message}. Is the backend reachable at ${API_URL}?`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = extractErrorMessage(body) || response.statusText || 'Request failed';
    throw new ApiError(response.status, `${detail} (HTTP ${response.status})`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.detail === 'string') return b.detail;
  if (typeof b.message === 'string') return b.message;
  if (Array.isArray(b.message)) return b.message.join('; ');
  if (Array.isArray(b.detail)) {
    return b.detail
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'msg' in entry) {
          return String((entry as { msg: unknown }).msg);
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');
  }
  return null;
}

// Connection API
export const connectionApi = {
  list: () => fetchApi<{ connections: ConnectionListItem[]; total: number }>('/connections'),

  test: (request: ConnectionRequest) =>
    fetchApi<{ success: boolean; jetstream_enabled: boolean; server_info: object; error?: string }>(
      '/connections/test',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ),

  connect: (request: ConnectionRequest) =>
    fetchApi<ConnectionResponse>('/connections/connect', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  getStatus: (connectionId: string) =>
    fetchApi<ConnectionStatus>(`/connections/${connectionId}/status`),

  disconnect: (connectionId: string) =>
    fetchApi<void>(`/connections/${connectionId}`, {
      method: 'DELETE',
    }),
};

export const clusterApi = {
  getOverview: (connectionId: string) =>
    fetchApi<ClusterOverview>(`/connections/${connectionId}/cluster/overview`),
};

export const jobApi = {
  startIndexBuild: (connectionId: string, streamName: string, limit = 2000) =>
    fetchApi<JobInfo>(`/connections/${connectionId}/jobs/index-build`, {
      method: 'POST',
      body: JSON.stringify({ stream_name: streamName, limit }),
    }),

  list: (connectionId: string, limit = 50) =>
    fetchApi<{ jobs: JobInfo[]; total: number }>(
      `/connections/${connectionId}/jobs?limit=${limit}`,
    ),

  get: (connectionId: string, jobId: string) =>
    fetchApi<JobInfo>(`/connections/${connectionId}/jobs/${jobId}`),

  cancel: (connectionId: string, jobId: string) =>
    fetchApi<JobInfo>(`/connections/${connectionId}/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),
};

// Stream API
export const streamApi = {
  list: (connectionId: string) =>
    fetchApi<{ streams: StreamInfo[]; total: number }>(`/connections/${connectionId}/streams`),

  get: (connectionId: string, streamName: string) =>
    fetchApi<StreamInfo>(`/connections/${connectionId}/streams/${streamName}`),

  create: (connectionId: string, config: StreamConfig) =>
    fetchApi<StreamInfo>(`/connections/${connectionId}/streams`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  update: (connectionId: string, streamName: string, config: Partial<StreamConfig>) =>
    fetchApi<StreamInfo>(`/connections/${connectionId}/streams/${streamName}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  delete: (connectionId: string, streamName: string) =>
    fetchApi<{ success: boolean; deleted_stream: string }>(
      `/connections/${connectionId}/streams/${streamName}`,
      {
        method: 'DELETE',
      },
    ),

  purge: (connectionId: string, streamName: string) =>
    fetchApi<{ success: boolean; purged: boolean }>(
      `/connections/${connectionId}/streams/${streamName}/purge`,
      {
        method: 'POST',
      },
    ),
};

// Consumer API
export const consumerApi = {
  list: (connectionId: string, streamName: string) =>
    fetchApi<{ consumers: ConsumerInfo[]; total: number }>(
      `/connections/${connectionId}/streams/${streamName}/consumers`,
    ),

  get: (connectionId: string, streamName: string, consumerName: string) =>
    fetchApi<ConsumerInfo>(
      `/connections/${connectionId}/streams/${streamName}/consumers/${consumerName}`,
    ),

  create: (connectionId: string, streamName: string, config: ConsumerConfig) =>
    fetchApi<ConsumerInfo>(`/connections/${connectionId}/streams/${streamName}/consumers`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  update: (
    connectionId: string,
    streamName: string,
    consumerName: string,
    config: Partial<ConsumerConfig>,
  ) =>
    fetchApi<ConsumerInfo>(
      `/connections/${connectionId}/streams/${streamName}/consumers/${consumerName}`,
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
    ),

  delete: (connectionId: string, streamName: string, consumerName: string) =>
    fetchApi<{ success: boolean; deleted_consumer: string }>(
      `/connections/${connectionId}/streams/${streamName}/consumers/${consumerName}`,
      {
        method: 'DELETE',
      },
    ),

  analytics: (connectionId: string, streamName: string) =>
    fetchApi<ConsumerAnalytics>(
      `/connections/${connectionId}/streams/${streamName}/consumers/analytics`,
    ),

  diagnostics: (connectionId: string, streamName?: string) => {
    const searchParams = new URLSearchParams();
    if (streamName) searchParams.set('stream', streamName);
    const query = searchParams.toString();
    return fetchApi<ConsumerDiagnosticsResponse>(
      `/connections/${connectionId}/consumers/diagnostics${query ? `?${query}` : ''}`,
    );
  },
};

// Message API
export const messageApi = {
  publish: (connectionId: string, request: MessagePublishRequest) =>
    fetchApi<MessagePublishResponse>(`/connections/${connectionId}/messages/publish`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  publishBatch: (
    connectionId: string,
    subject: string,
    messages: unknown[],
    headers?: Record<string, string>,
  ) =>
    fetchApi<{ published: number; results: MessagePublishResponse[] }>(
      `/connections/${connectionId}/messages/publish-batch`,
      {
        method: 'POST',
        body: JSON.stringify({
          messages: messages.map((data) => ({ subject, data, headers })),
        }),
      },
    ),

  getMessages: (connectionId: string, streamName: string, query: GetMessagesParams = {}) => {
    const {
      limit = 50,
      seqStart,
      seqEnd,
      includePayload = false,
      previewBytes = 1024,
      fromLatest = false,
      filterSubject,
      headerKey,
      headerValue,
      payloadContains,
      fromTime,
      toTime,
    } = query;

    const searchParams = new URLSearchParams({ limit: limit.toString() });
    if (seqStart) searchParams.append('seq_start', seqStart.toString());
    if (seqEnd) searchParams.append('seq_end', seqEnd.toString());
    searchParams.append('include_payload', includePayload ? 'true' : 'false');
    searchParams.append('preview_bytes', previewBytes.toString());
    searchParams.append('from_latest', fromLatest ? 'true' : 'false');
    if (filterSubject) searchParams.append('filter_subject', filterSubject);
    if (headerKey) searchParams.append('header_key', headerKey);
    if (headerValue) searchParams.append('header_value', headerValue);
    if (payloadContains) searchParams.append('payload_contains', payloadContains);
    if (fromTime) searchParams.append('from_time', fromTime);
    if (toTime) searchParams.append('to_time', toTime);

    return fetchApi<MessagesResponse>(
      `/connections/${connectionId}/streams/${streamName}/messages?${searchParams}`,
    );
  },

  getMessage: (connectionId: string, streamName: string, seq: number) =>
    fetchApi<MessageData>(`/connections/${connectionId}/streams/${streamName}/messages/${seq}`),

  replay: (connectionId: string, streamName: string, seq: number, request: MessageReplayRequest) =>
    fetchApi<MessageReplayResponse>(
      `/connections/${connectionId}/streams/${streamName}/messages/${seq}/replay`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    ),

  buildIndex: (connectionId: string, streamName: string, limit = 2000) =>
    fetchApi<{ stream_name: string; indexed_messages: number }>(
      `/connections/${connectionId}/streams/${streamName}/messages/index/build`,
      {
        method: 'POST',
        body: JSON.stringify({ limit }),
      },
    ),

  searchIndex: (connectionId: string, streamName: string, query: string, limit = 100) =>
    fetchApi<MessageIndexSearchResponse>(
      `/connections/${connectionId}/streams/${streamName}/messages/index/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    ),

  validateSchema: (connectionId: string, schema: Record<string, unknown>, payload: unknown) =>
    fetchApi<SchemaValidationResponse>(`/connections/${connectionId}/messages/validate-schema`, {
      method: 'POST',
      body: JSON.stringify({ schema, payload }),
    }),
};

export const metricsApi = {
  getStreamMetrics: (connectionId: string, streamName: string, window = 15) =>
    fetchApi<StreamMetricsResponse>(
      `/connections/${connectionId}/metrics/streams/${encodeURIComponent(streamName)}?window=${window}`,
    ),

  getAllStreamMetrics: (connectionId: string, window = 15) =>
    fetchApi<StreamMetricsSummaryResponse>(
      `/connections/${connectionId}/metrics/streams?window=${window}`,
    ),

  getConsumerMetrics: (
    connectionId: string,
    streamName: string,
    consumerName: string,
    window = 60,
  ) =>
    fetchApi<ConsumerMetricsResponse>(
      `/connections/${connectionId}/metrics/consumers/${encodeURIComponent(streamName)}/${encodeURIComponent(consumerName)}?window=${window}`,
    ),

  getAllConsumerMetrics: (connectionId: string, streamName: string, window = 60) =>
    fetchApi<ConsumerMetricsResponse[]>(
      `/connections/${connectionId}/metrics/consumers/${encodeURIComponent(streamName)}?window=${window}`,
    ),
};

export const connectionHealthApi = {
  getHistory: (connectionId: string, window = 24) =>
    fetchApi<HealthHistoryResponse>(`/connections/${connectionId}/health/history?window=${window}`),

  getUptime: (connectionId: string, window = 24) =>
    fetchApi<UptimeSummary>(`/connections/${connectionId}/health/uptime?window=${window}`),
};

export const systemApi = {
  observability: (connectionId: string) =>
    fetchApi<SystemObservability>(`/connections/${connectionId}/system/observability`),
};

// KV Store API
export const kvApi = {
  list: (connectionId: string) =>
    fetchApi<{ kv_stores: KvStoreStatus[]; total: number }>(`/connections/${connectionId}/kv`),

  create: (connectionId: string, config: KvCreateConfig) =>
    fetchApi<KvStoreStatus>(`/connections/${connectionId}/kv`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getStatus: (connectionId: string, bucket: string) =>
    fetchApi<KvStoreStatus>(`/connections/${connectionId}/kv/${encodeURIComponent(bucket)}`),

  delete: (connectionId: string, bucket: string) =>
    fetchApi<{ success: boolean; deleted_bucket: string }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}`,
      { method: 'DELETE' },
    ),

  listKeys: (connectionId: string, bucket: string) =>
    fetchApi<{ keys: string[]; total: number }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/keys`,
    ),

  getKey: (connectionId: string, bucket: string, key: string) =>
    fetchApi<KvEntryInfo>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/keys/${encodeURIComponent(key)}`,
    ),

  putKey: (connectionId: string, bucket: string, key: string, value: string) =>
    fetchApi<{ revision: number }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/keys/${encodeURIComponent(key)}`,
      { method: 'PUT', body: JSON.stringify({ value }) },
    ),

  deleteKey: (connectionId: string, bucket: string, key: string) =>
    fetchApi<{ success: boolean }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/keys/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    ),

  purgeKey: (connectionId: string, bucket: string, key: string) =>
    fetchApi<{ success: boolean }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/keys/${encodeURIComponent(key)}/purge`,
      { method: 'POST' },
    ),

  watchHistory: (connectionId: string, bucket: string) =>
    fetchApi<{ entries: KvEntryInfo[]; total: number }>(
      `/connections/${connectionId}/kv/${encodeURIComponent(bucket)}/history`,
    ),
};

// Object Store API
export const objectStoreApi = {
  list: (connectionId: string) =>
    fetchApi<{ object_stores: ObjectStoreStatusInfo[]; total: number }>(
      `/connections/${connectionId}/objectstore`,
    ),

  create: (connectionId: string, config: ObjectStoreCreateConfig) =>
    fetchApi<ObjectStoreStatusInfo>(`/connections/${connectionId}/objectstore`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getStatus: (connectionId: string, bucket: string) =>
    fetchApi<ObjectStoreStatusInfo>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}`,
    ),

  delete: (connectionId: string, bucket: string) =>
    fetchApi<{ success: boolean; deleted_bucket: string }>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}`,
      { method: 'DELETE' },
    ),

  listObjects: (connectionId: string, bucket: string) =>
    fetchApi<{ objects: ObjectInfoData[]; total: number }>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}/objects`,
    ),

  getObjectInfo: (connectionId: string, bucket: string, name: string) =>
    fetchApi<ObjectInfoData>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(name)}/info`,
    ),

  getObjectData: (connectionId: string, bucket: string, name: string) =>
    fetchApi<{ name: string; data: string }>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(name)}/data`,
    ),

  putObject: (
    connectionId: string,
    bucket: string,
    name: string,
    data: string,
    description?: string,
  ) =>
    fetchApi<ObjectInfoData>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}/objects`,
      {
        method: 'POST',
        body: JSON.stringify({ name, data, description }),
      },
    ),

  deleteObject: (connectionId: string, bucket: string, name: string) =>
    fetchApi<{ success: boolean }>(
      `/connections/${connectionId}/objectstore/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
};

export interface AuditListParams {
  limit?: number;
  offset?: number;
  action?: string;
  resourceType?: string;
  userId?: number;
}

export const auditApi = {
  list: (params: AuditListParams = {}) => {
    const searchParams = new URLSearchParams();
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset));
    if (params.action) searchParams.set('action', params.action);
    if (params.resourceType) searchParams.set('resource_type', params.resourceType);
    if (params.userId !== undefined) searchParams.set('user_id', String(params.userId));

    const query = searchParams.toString();
    return fetchApi<AuditListResult>(`/audit${query ? `?${query}` : ''}`);
  },
};

// Health API
export const healthApi = {
  check: async () => {
    const url = `${API_URL}/health`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new ApiError(response.status, 'Health check failed');
    }
    return response.json() as Promise<{ status: string; version: string }>;
  },
};

export { ApiError };
export interface GetMessagesParams {
  limit?: number;
  seqStart?: number;
  seqEnd?: number;
  includePayload?: boolean;
  previewBytes?: number;
  fromLatest?: boolean;
  filterSubject?: string;
  headerKey?: string;
  headerValue?: string;
  payloadContains?: string;
  fromTime?: string;
  toTime?: string;
}
