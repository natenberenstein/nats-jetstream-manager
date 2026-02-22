'use client';

import { Activity, Database, HardDrive, MessageSquare, RefreshCw, Users, AlertTriangle } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useSystemObservability } from '@/hooks/useSystem';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function MiniBarChart({
  title,
  items,
  formatter,
}: {
  title: string;
  items: { name: string; value: number }[];
  formatter?: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          items.map((item) => {
            const width = Math.max(2, Math.round((item.value / max) * 100));
            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{item.name}</span>
                  <span className="text-muted-foreground">{formatter ? formatter(item.value) : item.value}</span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function ObservabilityPage() {
  const { connectionId } = useConnection();
  const { data, isLoading, isError, error, refetch, isFetching } = useSystemObservability(connectionId);

  const cards = [
    { label: 'Streams', value: formatNumber(data?.streams ?? 0), icon: Database },
    { label: 'Consumers', value: formatNumber(data?.consumers ?? 0), icon: Users },
    { label: 'Messages', value: formatNumber(data?.messages ?? 0), icon: MessageSquare },
    { label: 'Storage', value: formatBytes(data?.bytes ?? 0), icon: HardDrive },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">System Observability</h1>
          <p className="text-muted-foreground">Cluster health, capacity, and high-level workload indicators</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-semibold">{isLoading ? '...' : card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">JetStream API + Capacity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Server Version</p>
            <p className="font-medium">{data?.server_version || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">API Calls</p>
            <p className="font-medium">{formatNumber(data?.js_api_total ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">API Errors</p>
            <p className="font-medium">{formatNumber(data?.js_api_errors ?? 0)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Connected</p>
            <p className="font-medium">{data?.connected ? 'yes' : 'no'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Memory Utilization</p>
            <p className="font-medium">{data?.memory_utilization != null ? `${data.memory_utilization}%` : '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Storage Utilization</p>
            <p className="font-medium">{data?.storage_utilization != null ? `${data.storage_utilization}%` : '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Memory</p>
            <p className="font-medium">
              {data?.memory_used != null ? formatBytes(data.memory_used) : '-'}
              {' / '}
              {data?.memory_limit != null ? formatBytes(data.memory_limit) : '-'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Storage</p>
            <p className="font-medium">
              {data?.storage_used != null ? formatBytes(data.storage_used) : '-'}
              {' / '}
              {data?.storage_limit != null ? formatBytes(data.storage_limit) : '-'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MiniBarChart
          title="Top Streams by Storage"
          items={data?.top_streams_by_bytes || []}
          formatter={(value) => formatBytes(value)}
        />
        <MiniBarChart
          title="Top Streams by Messages"
          items={data?.top_streams_by_messages || []}
          formatter={(value) => formatNumber(value)}
        />
      </div>

      {isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failed to load observability data: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Activity className="w-3 h-3" />
        Snapshot generated at {data?.generated_at ? new Date(data.generated_at).toLocaleString() : '-'}
      </div>
    </div>
  );
}
