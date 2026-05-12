'use client';

import { AlertTriangle, CheckCircle2, HardDrive, Layers, Network, Server } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useClusterOverview } from '@/hooks/useCluster';
import { cn, formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/cards/StatCard';

function replicationRowClass(stream: {
  healthy: boolean;
  has_quorum: boolean;
  offline_replicas: number;
  lagging_replicas: number;
}) {
  if (!stream.has_quorum || stream.offline_replicas > 0) {
    return 'border-l-destructive bg-destructive/5';
  }
  if (!stream.healthy || stream.lagging_replicas > 0) {
    return 'border-l-warning bg-warning/5';
  }
  return 'border-l-success';
}

export default function ClusterPage() {
  const { connectionId } = useConnection();
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } =
    useClusterOverview(connectionId);

  const stats = [
    {
      label: 'Topology',
      value: data?.topology === 'clustered' ? 'Clustered' : 'Standalone',
      icon: Network,
      metric: 'topology' as const,
    },
    {
      label: 'Nodes',
      value: formatNumber(data?.node_count ?? 0),
      icon: Server,
      metric: 'topology' as const,
    },
    {
      label: 'Streams',
      value: formatNumber(data?.stream_count ?? 0),
      icon: Layers,
      metric: 'streams' as const,
    },
    {
      label: 'Storage',
      value: formatBytes(data?.bytes ?? 0),
      icon: HardDrive,
      metric: 'storage' as const,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Cluster"
        description="Version, topology, node health, and replication posture"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            metric={stat.metric}
            isLoading={isLoading}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Discovery & Routing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Configured Servers</p>
            <p className="font-medium">{data?.configured_servers?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Discovered Servers</p>
            <p className="font-medium">{data?.discovered_servers?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Routes</p>
            <p className="font-medium">{data?.route_count ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Gateways / Leafnodes</p>
            <p className="font-medium">
              {data?.gateway_count ?? 0} / {data?.leafnode_count ?? 0}
            </p>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground mb-1">Discovered Endpoints</p>
            <p className="text-xs break-all">
              {(data?.discovered_servers || []).join(', ') || '-'}
            </p>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground mb-1">Configured Seed Endpoints</p>
            <p className="text-xs break-all">
              {(data?.configured_servers || []).join(', ') || '-'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Cluster Summary</CardTitle>
            {data?.topology === 'clustered' ? (
              <Badge>Clustered</Badge>
            ) : (
              <Badge variant="outline">Standalone</Badge>
            )}
            {data?.mixed_versions && <Badge variant="destructive">Mixed Versions</Badge>}
            {data?.confidence && (
              <Badge
                variant={
                  data.confidence === 'high'
                    ? 'default'
                    : data.confidence === 'medium'
                      ? 'secondary'
                      : 'outline'
                }
              >
                Confidence: {data.confidence}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Cluster Name</p>
            <p className="font-medium">{data?.cluster_name || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Server Version</p>
            <p className="font-medium">{data?.server_version || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Connected Server</p>
            <p className="font-medium break-all">{data?.connected_server || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">JetStream Domain</p>
            <p className="font-medium">{data?.js_domain || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">API Calls</p>
            <p className="font-medium">{formatNumber(data?.js_api_total ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">API Errors</p>
            <p className="font-medium">{formatNumber(data?.js_api_errors ?? 0)}</p>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <p className="text-muted-foreground mb-1">Sources</p>
            <div className="flex flex-wrap gap-2">
              {(data?.sources || []).length > 0 ? (
                data?.sources.map((source) => (
                  <Badge key={source} variant="outline">
                    {source}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No sources reported.</p>
              )}
            </div>
          </div>
          {data?.caveats?.length ? (
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-muted-foreground mb-1">Caveats</p>
              <div className="space-y-1">
                {data.caveats.map((caveat) => (
                  <p key={caveat} className="text-warning text-sm">
                    {caveat}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nodes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : data?.nodes.length ? (
            data.nodes.map((node) => (
              <div
                key={node.name}
                className="rounded border p-3 flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium break-all">{node.name}</p>
                  <p className="text-muted-foreground">role: {node.role || 'unknown'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {node.offline ? (
                    <Badge variant="destructive">offline</Badge>
                  ) : (
                    <Badge variant="success">online</Badge>
                  )}
                  {!!node.current && <Badge variant="outline">current</Badge>}
                  {!!node.lag && node.lag > 0 && <Badge variant="secondary">lag {node.lag}</Badge>}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No node details available from current permissions.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Replication Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-2">
            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    'h-4 w-4',
                    (data?.quorum_degraded_streams || 0) > 0 ? 'text-destructive' : 'text-success',
                  )}
                />
                <p className="text-muted-foreground">Quorum-Degraded Streams</p>
              </div>
              <Badge
                variant={(data?.quorum_degraded_streams || 0) > 0 ? 'destructive' : 'success'}
                className="rounded-md"
              >
                {data?.quorum_degraded_streams ?? 0}
              </Badge>
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    'h-4 w-4',
                    (data?.leaderless_streams || 0) > 0 ? 'text-destructive' : 'text-success',
                  )}
                />
                <p className="text-muted-foreground">Leaderless Streams</p>
              </div>
              <Badge
                variant={(data?.leaderless_streams || 0) > 0 ? 'destructive' : 'success'}
                className="rounded-md"
              >
                {data?.leaderless_streams ?? 0}
              </Badge>
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : data?.stream_health.length ? (
            data.stream_health.map((stream) => (
              <div
                key={stream.stream}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 rounded border border-l-4 p-3 text-sm',
                  replicationRowClass(stream),
                )}
              >
                <div>
                  <p className="font-medium">{stream.stream}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="rounded-md">
                      leader: {stream.leader || '-'}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                      replicas: {stream.replicas}
                    </Badge>
                    <Badge
                      variant={stream.online_replicas === stream.replicas ? 'success' : 'warning'}
                      className="rounded-md"
                    >
                      online: {stream.online_replicas}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {stream.healthy ? (
                    <Badge variant="success" className="rounded-md">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Healthy
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="rounded-md">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Degraded
                    </Badge>
                  )}
                  {!stream.has_quorum && (
                    <Badge variant="destructive" className="rounded-md">
                      no quorum
                    </Badge>
                  )}
                  {stream.offline_replicas > 0 && (
                    <Badge variant="destructive" className="rounded-md">
                      offline {stream.offline_replicas}
                    </Badge>
                  )}
                  {stream.lagging_replicas > 0 && (
                    <Badge variant="warning" className="rounded-md">
                      lagging {stream.lagging_replicas}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No stream health data available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : data?.warnings.length ? (
            <div className="space-y-2">
              {data.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No warnings detected.</p>
          )}
        </CardContent>
      </Card>

      {isError && (
        <div className="text-sm text-destructive">
          Failed to load cluster data: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
    </div>
  );
}
