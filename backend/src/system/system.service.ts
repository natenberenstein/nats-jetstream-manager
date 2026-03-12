import { Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';

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

const TOP_STREAMS_LIMIT = 8;

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  async getObservability(connectionId: string): Promise<SystemObservability> {
    const conn = this.connectionsService.getConnection(connectionId);
    const { nc, jsm } = conn;

    const connected = !nc.isClosed();
    const serverInfo = nc.info;
    const serverVersion = serverInfo?.version;

    // JetStream account info
    let streams = 0;
    let consumers = 0;
    let messages = 0;
    let bytes = 0;
    let jsApiTotal: number | undefined;
    let jsApiErrors: number | undefined;
    let memoryUsed: number | undefined;
    let storageUsed: number | undefined;
    let memoryLimit: number | undefined;
    let storageLimit: number | undefined;
    let memoryUtilization: number | undefined;
    let storageUtilization: number | undefined;

    try {
      const accountInfo = await jsm.getAccountInfo();

      streams = accountInfo.streams ?? 0;
      consumers = accountInfo.consumers ?? 0;
      memoryUsed = accountInfo.memory ?? 0;
      storageUsed = accountInfo.storage ?? 0;

      // Total messages/bytes come from the account-level stats
      messages = (accountInfo as any).messages ?? 0;
      bytes = storageUsed;

      if ((accountInfo as any).api) {
        jsApiTotal = (accountInfo as any).api.total;
        jsApiErrors = (accountInfo as any).api.errors;
      }

      if (accountInfo.limits) {
        memoryLimit = accountInfo.limits.max_memory;
        storageLimit = accountInfo.limits.max_storage;

        if (memoryLimit && memoryLimit > 0 && memoryUsed !== undefined) {
          memoryUtilization = memoryUsed / memoryLimit;
        }
        if (storageLimit && storageLimit > 0 && storageUsed !== undefined) {
          storageUtilization = storageUsed / storageLimit;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get JetStream account info: ${error.message}`,
      );
    }

    // Gather per-stream stats for top streams
    const streamsByBytes: SystemMetricPoint[] = [];
    const streamsByMessages: SystemMetricPoint[] = [];

    try {
      const streamInfos = await jsm.streams.list().next();

      for (const si of streamInfos) {
        const config = (si as any).config;
        const state = (si as any).state;
        if (!config || !state) {
          continue;
        }

        const name = config.name ?? 'unknown';
        const streamBytes = state.bytes ?? 0;
        const streamMessages = state.messages ?? 0;

        streamsByBytes.push({ name, value: streamBytes });
        streamsByMessages.push({ name, value: streamMessages });

        // If account-level messages wasn't available, accumulate from streams
        if (messages === 0) {
          messages += streamMessages;
        }
        if (bytes === 0) {
          bytes += streamBytes;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to list streams for observability: ${error.message}`,
      );
    }

    // Sort descending and take top N
    streamsByBytes.sort((a, b) => b.value - a.value);
    streamsByMessages.sort((a, b) => b.value - a.value);

    const topStreamsByBytes = streamsByBytes.slice(0, TOP_STREAMS_LIMIT);
    const topStreamsByMessages = streamsByMessages.slice(0, TOP_STREAMS_LIMIT);

    return {
      connected,
      server_version: serverVersion,
      uptime_hint_seconds: undefined,
      streams,
      consumers,
      messages,
      bytes,
      js_api_total: jsApiTotal,
      js_api_errors: jsApiErrors,
      memory_used: memoryUsed,
      storage_used: storageUsed,
      memory_limit: memoryLimit,
      storage_limit: storageLimit,
      memory_utilization: memoryUtilization,
      storage_utilization: storageUtilization,
      top_streams_by_bytes: topStreamsByBytes,
      top_streams_by_messages: topStreamsByMessages,
      generated_at: new Date().toISOString(),
    };
  }
}
