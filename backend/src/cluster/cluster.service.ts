import { Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';

export interface ClusterNodeInfo {
  name: string;
  is_leader?: boolean;
  current?: boolean;
  active?: number;
  offline?: boolean;
  lag?: number;
}

export interface ClusterLimits {
  max_memory?: number;
  max_storage?: number;
  max_streams?: number;
  max_consumers?: number;
  max_ack_pending?: number;
  memory_max_stream_bytes?: number;
  storage_max_stream_bytes?: number;
  max_bytes_required?: boolean;
}

export interface ClusterStreamHealth {
  stream_name: string;
  cluster_name?: string;
  leader?: string;
  replicas: ClusterNodeInfo[];
  quorum_degraded: boolean;
  leaderless: boolean;
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

@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  async getOverview(connectionId: string): Promise<ClusterOverview> {
    const conn = this.connectionsService.getConnection(connectionId);
    const { nc, jsm } = conn;

    const sources: string[] = [];
    const caveats: string[] = [];
    const warnings: string[] = [];

    // Gather server info
    const serverInfo = nc.info;
    sources.push('server_info');

    const serverVersion = serverInfo?.version;
    const connectedServer = serverInfo?.server_name || serverInfo?.server_id;
    const clusterName = (serverInfo as any)?.cluster;
    const discoveredServers = serverInfo?.connect_urls || [];
    const routeCount = (serverInfo as any)?.routes ?? 0;
    const gatewayCount = (serverInfo as any)?.gateways ?? 0;
    const leafnodeCount = (serverInfo as any)?.leafnodes ?? 0;

    const isClustered =
      !!clusterName || discoveredServers.length > 1 || routeCount > 0;
    const topology: 'standalone' | 'clustered' = isClustered
      ? 'clustered'
      : 'standalone';

    // Gather JetStream account info
    let streamCount = 0;
    let consumerCount = 0;
    let totalMessages = 0;
    let totalBytes = 0;
    let jsDomain: string | undefined;
    let jsApiTotal: number | undefined;
    let jsApiErrors: number | undefined;
    let limits: ClusterLimits | null = null;

    try {
      const accountInfo = await jsm.getAccountInfo();
      sources.push('jetstream_account_info');

      streamCount = accountInfo.streams ?? 0;
      consumerCount = accountInfo.consumers ?? 0;
      totalMessages = (accountInfo as any).messages ?? 0;
      totalBytes = (accountInfo as any).storage ?? 0;
      jsDomain = (accountInfo as any).domain;

      if ((accountInfo as any).api) {
        jsApiTotal = (accountInfo as any).api.total;
        jsApiErrors = (accountInfo as any).api.errors;
      }

      if (accountInfo.limits) {
        const l = accountInfo.limits;
        limits = {
          max_memory: l.max_memory,
          max_storage: l.max_storage,
          max_streams: l.max_streams,
          max_consumers: l.max_consumers,
          max_ack_pending: l.max_ack_pending,
          memory_max_stream_bytes: (l as any).memory_max_stream_bytes,
          storage_max_stream_bytes: (l as any).storage_max_stream_bytes,
          max_bytes_required: (l as any).max_bytes_required,
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to get JetStream account info: ${error.message}`);
      caveats.push('JetStream account info unavailable');
    }

    // Gather stream health and cluster node info
    const streamHealth: ClusterStreamHealth[] = [];
    const nodesMap = new Map<string, ClusterNodeInfo>();
    const versions = new Set<string>();
    let quorumDegradedStreams = 0;
    let leaderlessStreams = 0;

    if (serverVersion) {
      versions.add(serverVersion);
    }

    try {
      const streams = await jsm.streams.list().next();
      sources.push('stream_list');

      for (const si of streams) {
        const cluster = (si as any).cluster;
        if (!cluster) {
          continue;
        }

        const leader = cluster.leader;
        const replicas: ClusterNodeInfo[] = (cluster.replicas || []).map(
          (r: any) => ({
            name: r.name,
            is_leader: false,
            current: r.current,
            active: r.active,
            offline: r.offline,
            lag: r.lag,
          }),
        );

        if (leader) {
          // Track leader node
          if (!nodesMap.has(leader)) {
            nodesMap.set(leader, { name: leader, is_leader: true });
          }
        }

        for (const r of replicas) {
          if (!nodesMap.has(r.name)) {
            nodesMap.set(r.name, r);
          }
        }

        const isLeaderless = !leader;
        const isQuorumDegraded =
          replicas.some((r) => r.offline) || isLeaderless;

        if (isLeaderless) {
          leaderlessStreams++;
          warnings.push(
            `Stream "${(si as any).config?.name}" has no leader`,
          );
        }
        if (isQuorumDegraded) {
          quorumDegradedStreams++;
        }

        streamHealth.push({
          stream_name: (si as any).config?.name ?? 'unknown',
          cluster_name: cluster.name,
          leader,
          replicas,
          quorum_degraded: isQuorumDegraded,
          leaderless: isLeaderless,
        });
      }
    } catch (error) {
      this.logger.warn(`Failed to list streams for cluster health: ${error.message}`);
      caveats.push('Stream health information unavailable');
    }

    const nodes = Array.from(nodesMap.values());
    const nodeCount = isClustered
      ? Math.max(nodes.length, discoveredServers.length, 1)
      : 1;

    const mixedVersions = versions.size > 1;

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (caveats.length > 0) {
      confidence = 'medium';
    }
    if (!isClustered && nodeCount <= 1) {
      // Standalone — limited cluster visibility
      if (caveats.length > 0) {
        confidence = 'low';
      }
    }

    return {
      topology,
      cluster_name: clusterName,
      connected_server: connectedServer,
      server_version: serverVersion,
      mixed_versions: mixedVersions,
      node_count: nodeCount,
      discovered_servers: discoveredServers,
      configured_servers: [],
      route_count: routeCount,
      gateway_count: gatewayCount,
      leafnode_count: leafnodeCount,
      nodes,
      stream_count: streamCount,
      consumer_count: consumerCount,
      messages: totalMessages,
      bytes: totalBytes,
      js_domain: jsDomain,
      js_api_total: jsApiTotal,
      js_api_errors: jsApiErrors,
      limits,
      confidence,
      sources,
      caveats,
      warnings,
      quorum_degraded_streams: quorumDegradedStreams,
      leaderless_streams: leaderlessStreams,
      stream_health: streamHealth,
      generated_at: new Date().toISOString(),
    };
  }
}
