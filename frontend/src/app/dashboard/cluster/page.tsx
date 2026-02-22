'use client';

import { AlertTriangle, CheckCircle2, Layers, Network, RefreshCw, Server, ShieldAlert } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useClusterOverview } from '@/hooks/useCluster';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ClusterPage() {
  const { connectionId } = useConnection();
  const { data, isLoading, isError, error, refetch, isFetching } = useClusterOverview(connectionId);

  const stats = [
    { label: 'Topology', value: data?.topology === 'clustered' ? 'Clustered' : 'Standalone', icon: Network },
    { label: 'Nodes', value: formatNumber(data?.node_count ?? 0), icon: Server },
    { label: 'Streams', value: formatNumber(data?.stream_count ?? 0), icon: Layers },
    { label: 'Storage', value: formatBytes(data?.bytes ?? 0), icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">Cluster</h1>
          <p className="text-muted-foreground">Version, topology, node health, and replication posture</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold">{isLoading ? '...' : stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
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
            <p className="font-medium">{data?.gateway_count ?? 0} / {data?.leafnode_count ?? 0}</p>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground mb-1">Discovered Endpoints</p>
            <p className="text-xs break-all">{(data?.discovered_servers || []).join(', ') || '-'}</p>
          </div>
          <div className="md:col-span-2 lg:col-span-4">
            <p className="text-muted-foreground mb-1">Configured Seed Endpoints</p>
            <p className="text-xs break-all">{(data?.configured_servers || []).join(', ') || '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Cluster Summary</CardTitle>
            {data?.topology === 'clustered' ? <Badge>Clustered</Badge> : <Badge variant="outline">Standalone</Badge>}
            {data?.mixed_versions && <Badge variant="destructive">Mixed Versions</Badge>}
            {data?.confidence && (
              <Badge variant={data.confidence === 'high' ? 'default' : data.confidence === 'medium' ? 'secondary' : 'outline'}>
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
                  <Badge key={source} variant="outline">{source}</Badge>
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
                  <p key={caveat} className="text-amber-700 text-sm">{caveat}</p>
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
            <p className="text-sm text-muted-foreground">Loading nodes...</p>
          ) : data?.nodes.length ? (
            data.nodes.map((node) => (
              <div key={node.name} className="rounded border p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium break-all">{node.name}</p>
                  <p className="text-muted-foreground">role: {node.role || 'unknown'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {node.offline ? (
                    <Badge variant="destructive">offline</Badge>
                  ) : (
                    <Badge className="bg-emerald-600">online</Badge>
                  )}
                  {!!node.current && <Badge variant="outline">current</Badge>}
                  {!!node.lag && node.lag > 0 && <Badge variant="secondary">lag {node.lag}</Badge>}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No node details available from current permissions.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Replication Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-2">
            <div>
              <p className="text-muted-foreground">Quorum-Degraded Streams</p>
              <p className={`font-semibold ${(data?.quorum_degraded_streams || 0) > 0 ? 'text-destructive' : ''}`}>
                {data?.quorum_degraded_streams ?? 0}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Leaderless Streams</p>
              <p className={`font-semibold ${(data?.leaderless_streams || 0) > 0 ? 'text-destructive' : ''}`}>
                {data?.leaderless_streams ?? 0}
              </p>
            </div>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading stream health...</p>
          ) : data?.stream_health.length ? (
            data.stream_health.map((stream) => (
              <div key={stream.stream} className="rounded border p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{stream.stream}</p>
                  <p className="text-muted-foreground">
                    leader: {stream.leader || '-'} | replicas: {stream.replicas} | online: {stream.online_replicas}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {stream.healthy ? (
                    <Badge className="bg-emerald-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />Healthy
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertTriangle className="w-3 h-3 mr-1" />Degraded
                    </Badge>
                  )}
                  {!stream.has_quorum && <Badge variant="destructive">no quorum</Badge>}
                  {stream.offline_replicas > 0 && <Badge variant="destructive">offline {stream.offline_replicas}</Badge>}
                  {stream.lagging_replicas > 0 && <Badge variant="secondary">lagging {stream.lagging_replicas}</Badge>}
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
            <p className="text-sm text-muted-foreground">Loading warnings...</p>
          ) : data?.warnings.length ? (
            <div className="space-y-2">
              {data.warnings.map((warning) => (
                <div key={warning} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
