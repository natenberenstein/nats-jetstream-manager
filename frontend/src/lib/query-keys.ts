import { AuditListParams, GetMessagesParams } from './api';

export const queryKeys = {
  audit: {
    list: (params: AuditListParams) => ['audit', params] as const,
  },
  cluster: {
    overview: (connectionId: string | null) => ['cluster-overview', connectionId] as const,
  },
  consumers: {
    list: (connectionId: string | null, streamName: string | null) =>
      ['consumers', connectionId, streamName] as const,
    detail: (connectionId: string | null, streamName: string | null, consumerName: string | null) =>
      ['consumer', connectionId, streamName, consumerName] as const,
    diagnostics: (connectionId: string | null, streamName?: string | null) =>
      ['consumer-diagnostics', connectionId, streamName ?? null] as const,
    analytics: (connectionId: string | null, streamName: string | null) =>
      ['consumer-analytics', connectionId, streamName] as const,
    metrics: (connectionId: string | null, streamName: string | null, window?: number) =>
      window === undefined
        ? (['consumer-metrics', connectionId, streamName] as const)
        : (['consumer-metrics', connectionId, streamName, window] as const),
    metric: (
      connectionId: string | null,
      streamName: string | null,
      consumerName: string | null,
      window?: number,
    ) =>
      window === undefined
        ? (['consumer-metric', connectionId, streamName, consumerName] as const)
        : (['consumer-metric', connectionId, streamName, consumerName, window] as const),
  },
  health: {
    history: (connectionId: string | null, window: number) =>
      ['health-history', connectionId, window] as const,
    uptime: (connectionId: string | null, window: number) =>
      ['uptime-summary', connectionId, window] as const,
  },
  jobs: {
    list: (connectionId: string | null) => ['jobs', connectionId] as const,
  },
  kv: {
    stores: (connectionId: string | null) => ['kv-stores', connectionId] as const,
    status: (connectionId: string | null, bucket: string | null) =>
      ['kv-status', connectionId, bucket] as const,
    keys: (connectionId: string | null, bucket: string | null) =>
      ['kv-keys', connectionId, bucket] as const,
    entry: (connectionId: string | null, bucket: string | null, key?: string | null) =>
      key === undefined
        ? (['kv-entry', connectionId, bucket] as const)
        : (['kv-entry', connectionId, bucket, key] as const),
    watch: (connectionId: string | null, bucket: string | null) =>
      ['kv-watch', connectionId, bucket] as const,
  },
  messages: {
    list: (
      connectionId: string | null,
      streamName: string | null,
      params: GetMessagesParams = {},
    ) => ['messages', connectionId, streamName, params] as const,
    byStream: (connectionId: string | null, streamName: string | null) =>
      ['messages', connectionId, streamName] as const,
    detail: (connectionId: string | null, streamName: string | null, seq: number | null) =>
      ['message', connectionId, streamName, seq] as const,
    detailByStream: (connectionId: string | null, streamName: string | null) =>
      ['message', connectionId, streamName] as const,
  },
  objectStore: {
    stores: (connectionId: string | null) => ['object-stores', connectionId] as const,
    status: (connectionId: string | null, bucket: string | null) =>
      ['object-store-status', connectionId, bucket] as const,
    list: (connectionId: string | null, bucket: string | null) =>
      ['object-list', connectionId, bucket] as const,
  },
  streams: {
    list: (connectionId: string | null) => ['streams', connectionId] as const,
    detail: (connectionId: string | null, streamName: string | null) =>
      ['stream', connectionId, streamName] as const,
  },
  streamMetrics: {
    detail: (connectionId: string | null, streamName: string | null, window?: number) =>
      window === undefined
        ? (['stream-metrics', connectionId, streamName] as const)
        : (['stream-metrics', connectionId, streamName, window] as const),
    all: (connectionId: string | null, window?: number) =>
      window === undefined
        ? (['all-stream-metrics', connectionId] as const)
        : (['all-stream-metrics', connectionId, window] as const),
  },
  system: {
    observability: (connectionId: string | null) => ['system-observability', connectionId] as const,
  },
};
