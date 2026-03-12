/**
 * Extended NATS types for fields present in the server response
 * but missing from the official nats.js TypeScript definitions.
 */

import { ServerInfo, JetStreamAccountStats, AccountLimits } from 'nats';

export interface ExtendedServerInfo extends ServerInfo {
  cluster?: string;
  routes?: number;
  gateways?: number;
  leafnodes?: number;
}

/**
 * JetStreamAccountStats already includes streams, consumers, memory,
 * storage, api, domain, and limits from the base types.
 * This extension adds `messages` which is returned by the server
 * but not in the official types.
 */
export interface ExtendedAccountInfo extends JetStreamAccountStats {
  messages?: number;
}

export interface ExtendedAccountLimits extends Partial<AccountLimits> {
  memory_max_stream_bytes?: number;
  storage_max_stream_bytes?: number;
  max_bytes_required?: number;
}

export interface StreamClusterInfo {
  name?: string;
  leader?: string;
  replicas?: Array<{
    name: string;
    current?: boolean;
    active?: number;
    offline?: boolean;
    lag?: number;
  }>;
}

export interface ExtendedStreamInfo {
  config?: { name?: string };
  state?: { bytes?: number; messages?: number };
  cluster?: StreamClusterInfo;
}

export interface HttpExceptionResponseBody {
  message?: string | string[];
  detail?: string;
  statusCode?: number;
}
