import { Injectable, Logger } from '@nestjs/common';
import { NatsConnection, RequestStrategy, StringCodec } from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import {
  ExtendedServerInfo,
  ExtendedAccountInfo,
  ExtendedAccountLimits,
  ExtendedStreamInfo,
} from '../common/types/nats-extended';

interface SysPingResponse {
  server?: {
    name?: string;
    id?: string;
    ver?: string;
    jetstream?: boolean;
    cluster?: string;
  };
}

interface VarzResponse {
  server_name?: string;
  version?: string;
  jetstream?: {
    meta?: {
      leader?: string;
      cluster_size?: number;
    };
  };
}

interface RoutezResponse {
  routes?: Array<{
    remote_name?: string;
    ip?: string;
    port?: number;
  }>;
}

export interface ClusterNodeInfo {
  name: string;
  role?: 'leader' | 'replica' | 'unknown';
  current?: boolean;
  active?: number;
  offline?: boolean;
  lag?: number;
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
  max_bytes_required?: boolean;
}

export interface ClusterStreamHealth {
  stream: string;
  cluster_name?: string;
  leader?: string;
  replicas: number;
  replicas_seen: number;
  online_replicas: number;
  offline_replicas: number;
  lagging_replicas: number;
  has_quorum: boolean;
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
    const serverInfo = nc.info as ExtendedServerInfo | undefined;
    sources.push('server_info');

    const serverVersion = serverInfo?.version;
    const connectedServer = serverInfo?.server_name || serverInfo?.server_id;
    const clusterName = serverInfo?.cluster;
    const discoveredServers = serverInfo?.connect_urls || [];
    const routeCount = serverInfo?.routes ?? 0;
    const gatewayCount = serverInfo?.gateways ?? 0;
    const leafnodeCount = serverInfo?.leafnodes ?? 0;

    const isClustered = !!clusterName || discoveredServers.length > 1 || routeCount > 0;
    const topology: 'standalone' | 'clustered' = isClustered ? 'clustered' : 'standalone';

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
      const accountInfo = (await jsm.getAccountInfo()) as ExtendedAccountInfo;
      sources.push('jetstream_account_info');

      streamCount = accountInfo.streams ?? 0;
      consumerCount = accountInfo.consumers ?? 0;
      totalMessages = accountInfo.messages ?? 0;
      totalBytes = (accountInfo.memory ?? 0) + (accountInfo.storage ?? 0);
      jsDomain = accountInfo.domain;

      if (accountInfo.api) {
        jsApiTotal = accountInfo.api.total;
        jsApiErrors = accountInfo.api.errors;
      }

      if (accountInfo.limits) {
        const l = accountInfo.limits as ExtendedAccountLimits;
        limits = {
          max_memory: l.max_memory,
          max_storage: l.max_storage,
          max_streams: l.max_streams,
          max_consumers: l.max_consumers,
          max_ack_pending: l.max_ack_pending,
          memory_max_stream_bytes: l.memory_max_stream_bytes,
          storage_max_stream_bytes: l.storage_max_stream_bytes,
          max_bytes_required: !!l.max_bytes_required,
        };
      }
    } catch (error: unknown) {
      this.logger.warn(`Failed to get JetStream account info: ${(error as Error).message}`);
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

    // Seed the connected server so it always shows, even with no replicated streams
    if (connectedServer) {
      nodesMap.set(connectedServer, {
        name: connectedServer,
        current: true,
        role: 'unknown',
        version: serverVersion,
      });
    }

    try {
      const streams: ExtendedStreamInfo[] = [];
      const streamLister = jsm.streams.list();
      for await (const stream of streamLister) {
        streams.push(stream as ExtendedStreamInfo);
      }
      sources.push('stream_list');

      let streamMessages = 0;
      let streamBytes = 0;
      let streamConsumers = 0;

      for (const si of streams) {
        const streamName = si.config?.name ?? 'unknown';
        streamMessages += si.state?.messages ?? 0;
        streamBytes += si.state?.bytes ?? 0;
        streamConsumers += si.state?.consumer_count ?? 0;

        const cluster = si.cluster;
        if (!cluster) {
          continue;
        }

        const leader = cluster.leader;
        const replicaList = cluster.replicas || [];
        const totalReplicas = replicaList.length + (leader ? 1 : 0);
        const onlineReplicas = replicaList.filter((r) => !r.offline).length + (leader ? 1 : 0);
        const offlineReplicas = replicaList.filter((r) => r.offline).length;
        const laggingReplicas = replicaList.filter((r) => (r.lag ?? 0) > 0).length;
        const quorumCount = Math.floor(totalReplicas / 2) + 1;
        const hasQuorum = !!leader && onlineReplicas >= quorumCount;
        const isLeaderless = !leader;
        const isQuorumDegraded = !hasQuorum;
        const isHealthy = !!leader && hasQuorum && offlineReplicas === 0 && laggingReplicas === 0;

        if (leader) {
          const existing = nodesMap.get(leader);
          nodesMap.set(leader, {
            ...(existing || { name: leader }),
            role: 'leader',
          });
        }

        for (const r of replicaList) {
          const existing = nodesMap.get(r.name);
          nodesMap.set(r.name, {
            name: r.name,
            role: existing?.role === 'leader' ? 'leader' : 'replica',
            current: existing?.current ?? r.current,
            active: r.active,
            offline: r.offline,
            lag: r.lag,
            version: existing?.version,
          });
        }

        if (isLeaderless) {
          leaderlessStreams++;
          warnings.push(`Stream "${streamName}" has no leader`);
        }
        if (isQuorumDegraded) {
          quorumDegradedStreams++;
        }

        streamHealth.push({
          stream: streamName,
          cluster_name: cluster.name,
          leader,
          replicas: totalReplicas,
          replicas_seen: totalReplicas,
          online_replicas: onlineReplicas,
          offline_replicas: offlineReplicas,
          lagging_replicas: laggingReplicas,
          has_quorum: hasQuorum,
          healthy: isHealthy,
        });
      }

      streamCount = streams.length;
      consumerCount = streamConsumers;
      totalMessages = streamMessages;
      totalBytes = streamBytes;
    } catch (error: unknown) {
      this.logger.warn(`Failed to list streams for cluster health: ${(error as Error).message}`);
      caveats.push('Stream health information unavailable');
    }

    // Peer discovery: prefer sys-account ping, then monitoring HTTP, then caveat.
    let metaLeader: string | undefined;
    let expectedClusterSize: number | undefined;
    let discoverySource: 'sys_ping' | 'monitoring_http' | undefined;

    if (isClustered && conn.sysNc) {
      try {
        const peers = await this.pingSystemServers(conn.sysNc);
        for (const p of peers) {
          if (!p.name) continue;
          const existing = nodesMap.get(p.name);
          nodesMap.set(p.name, {
            name: p.name,
            role: existing?.role ?? 'unknown',
            current: existing?.current ?? p.name === connectedServer,
            version: p.version || existing?.version,
          });
          if (p.version) versions.add(p.version);
        }
        if (peers.length > 0) {
          discoverySource = 'sys_ping';
          sources.push('system_server_ping');
        }
      } catch (error: unknown) {
        this.logger.warn(`System-account peer ping failed: ${(error as Error).message}`);
      }
    }

    if (isClustered && !discoverySource && conn.monitoringUrl) {
      try {
        const scraped = await this.scrapeMonitoring(conn.monitoringUrl);
        metaLeader = scraped.metaLeader;
        expectedClusterSize = scraped.clusterSize;
        for (const name of scraped.peerNames) {
          if (!nodesMap.has(name)) {
            nodesMap.set(name, {
              name,
              role: name === metaLeader ? 'leader' : 'replica',
            });
          }
        }
        if (metaLeader && nodesMap.has(metaLeader)) {
          const existing = nodesMap.get(metaLeader)!;
          nodesMap.set(metaLeader, { ...existing, role: 'leader' });
        }
        discoverySource = 'monitoring_http';
        sources.push('monitoring_http');
      } catch (error: unknown) {
        this.logger.warn(`Monitoring scrape failed: ${(error as Error).message}`);
        caveats.push(`Monitoring endpoint unreachable: ${(error as Error).message}`);
      }
    }

    const nodes = Array.from(nodesMap.values());
    const nodeCount = isClustered
      ? Math.max(nodes.length, expectedClusterSize ?? 0, discoveredServers.length, 1)
      : 1;

    if (isClustered && nodes.length < nodeCount && !discoverySource) {
      caveats.push(
        `Only ${nodes.length} of ${nodeCount} peer node names are known. Provide $SYS account credentials or a monitoring URL on the connection to resolve peer names.`,
      );
    }

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

  private async pingSystemServers(
    sysNc: NatsConnection,
  ): Promise<Array<{ name?: string; version?: string }>> {
    const sc = StringCodec();
    const results: Array<{ name?: string; version?: string }> = [];
    const iter = await sysNc.requestMany('$SYS.REQ.SERVER.PING', sc.encode(''), {
      strategy: RequestStrategy.Timer,
      maxWait: 1500,
    });
    for await (const msg of iter) {
      try {
        const payload = JSON.parse(sc.decode(msg.data)) as SysPingResponse;
        results.push({
          name: payload.server?.name,
          version: payload.server?.ver,
        });
      } catch {
        // skip malformed
      }
    }
    return results;
  }

  private async scrapeMonitoring(
    monitoringUrl: string,
  ): Promise<{ metaLeader?: string; clusterSize?: number; peerNames: string[] }> {
    const base = monitoringUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const [varzRes, routezRes] = await Promise.all([
        fetch(`${base}/varz`, { signal: controller.signal }),
        fetch(`${base}/routez`, { signal: controller.signal }),
      ]);
      if (!varzRes.ok) {
        throw new Error(`/varz returned ${varzRes.status}`);
      }
      const varz = (await varzRes.json()) as VarzResponse;
      const routez = routezRes.ok ? ((await routezRes.json()) as RoutezResponse) : { routes: [] };

      const peerNames = new Set<string>();
      if (varz.server_name) peerNames.add(varz.server_name);
      for (const r of routez.routes || []) {
        if (r.remote_name) peerNames.add(r.remote_name);
      }

      return {
        metaLeader: varz.jetstream?.meta?.leader,
        clusterSize: varz.jetstream?.meta?.cluster_size,
        peerNames: Array.from(peerNames),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
