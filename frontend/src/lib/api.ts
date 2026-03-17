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
  AuditLogResponse,
  ConsumerConfig,
  ConsumerInfo,
  ConsumerAnalytics,
  MessagePublishRequest,
  MessagePublishResponse,
  MessageReplayRequest,
  MessageReplayResponse,
  MessageData,
  MessageIndexSearchResponse,
  MessagesResponse,
  SchemaValidationResponse,
  SystemObservability,
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

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: response.statusText,
    }));
    throw new ApiError(response.status, error.detail || 'Request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
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
        body: JSON.stringify({ subject, messages, headers }),
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
};

export const connectionHealthApi = {
  getHistory: (connectionId: string, window = 24) =>
    fetchApi<HealthHistoryResponse>(`/connections/${connectionId}/health/history?window=${window}`),

  getUptime: (connectionId: string, window = 24) =>
    fetchApi<UptimeSummary>(`/connections/${connectionId}/health/uptime?window=${window}`),
};

export const auditApi = {
  list: (
    params: {
      limit?: number;
      offset?: number;
      action?: string;
      resource_type?: string;
      user_id?: number;
    } = {},
  ) => {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());
    if (params.action) searchParams.append('action', params.action);
    if (params.resource_type) searchParams.append('resource_type', params.resource_type);
    if (params.user_id) searchParams.append('user_id', params.user_id.toString());
    const qs = searchParams.toString();
    return fetchApi<AuditLogResponse>(`/audit${qs ? `?${qs}` : ''}`);
  },
};

export const systemApi = {
  observability: (connectionId: string) =>
    fetchApi<SystemObservability>(`/connections/${connectionId}/system/observability`),
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
}
