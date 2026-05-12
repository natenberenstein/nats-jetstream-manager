'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams } from '@/hooks/useStreams';
import { useClusterOverview } from '@/hooks/useCluster';
import { useConsumerDiagnostics } from '@/hooks/useConsumers';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  HardDrive,
  Layers,
  MessageSquare,
  Network,
  Users,
} from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { StatCard } from '@/components/cards/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Skeleton } from '@/components/ui/skeleton';

type AttentionSeverity = 'critical' | 'warning' | 'info';

interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  href: string;
  source: string;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function severityBadgeVariant(severity: AttentionSeverity): 'destructive' | 'warning' | 'outline' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'outline';
}

function streamLimitRatio(used: number, limit?: number) {
  if (!limit || limit <= 0) return null;
  return used / limit;
}

export default function DashboardPage() {
  const { connectionId } = useConnection();
  const {
    data: streamsData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useStreams(connectionId);
  const {
    data: clusterData,
    isLoading: isClusterLoading,
    isFetching: isClusterFetching,
    refetch: refetchCluster,
  } = useClusterOverview(connectionId);
  const {
    data: consumerDiagnostics,
    isLoading: isDiagnosticsLoading,
    isFetching: isDiagnosticsFetching,
    refetch: refetchDiagnostics,
  } = useConsumerDiagnostics(connectionId);

  const totalStreams = streamsData?.total || 0;
  const totalMessages =
    streamsData?.streams.reduce((sum, s) => sum + (s.state?.messages || 0), 0) || 0;
  const totalBytes = streamsData?.streams.reduce((sum, s) => sum + (s.state?.bytes || 0), 0) || 0;
  const totalConsumers =
    streamsData?.streams.reduce((sum, s) => sum + (s.state?.consumer_count || 0), 0) || 0;
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if ((clusterData?.leaderless_streams ?? 0) > 0) {
      items.push({
        id: 'cluster-leaderless',
        severity: 'critical',
        title: `${clusterData?.leaderless_streams} leaderless stream${clusterData?.leaderless_streams === 1 ? '' : 's'}`,
        detail: 'One or more replicated streams have no leader.',
        href: '/dashboard/cluster',
        source: 'Cluster',
      });
    }

    if ((clusterData?.quorum_degraded_streams ?? 0) > 0) {
      items.push({
        id: 'cluster-quorum',
        severity: 'critical',
        title: `${clusterData?.quorum_degraded_streams} quorum-degraded stream${clusterData?.quorum_degraded_streams === 1 ? '' : 's'}`,
        detail: 'Replicated streams are missing enough replicas to put availability at risk.',
        href: '/dashboard/cluster',
        source: 'Cluster',
      });
    }

    if (clusterData?.mixed_versions) {
      items.push({
        id: 'cluster-versions',
        severity: 'warning',
        title: 'Mixed server versions',
        detail: 'Cluster nodes are not all reporting the same NATS server version.',
        href: '/dashboard/cluster',
        source: 'Cluster',
      });
    }

    clusterData?.warnings?.slice(0, 3).forEach((warning, index) => {
      items.push({
        id: `cluster-warning-${index}`,
        severity: 'warning',
        title: 'Cluster warning',
        detail: warning,
        href: '/dashboard/cluster',
        source: 'Cluster',
      });
    });

    clusterData?.stream_health
      ?.filter((stream) => !stream.healthy)
      .slice(0, 5)
      .forEach((stream) => {
        const reasons = [
          !stream.has_quorum ? 'no quorum' : null,
          stream.offline_replicas > 0 ? `${stream.offline_replicas} offline replica` : null,
          stream.lagging_replicas > 0 ? `${stream.lagging_replicas} lagging replica` : null,
        ].filter(Boolean);
        items.push({
          id: `stream-health-${stream.stream}`,
          severity: !stream.has_quorum ? 'critical' : 'warning',
          title: `Replication issue: ${stream.stream}`,
          detail: reasons.join(', ') || 'Stream replication is degraded.',
          href: '/dashboard/cluster',
          source: 'Replication',
        });
      });

    streamsData?.streams.forEach((stream) => {
      const ratio = streamLimitRatio(stream.state.bytes, stream.config.max_bytes);
      if (ratio !== null && ratio >= 0.75) {
        items.push({
          id: `stream-storage-${stream.config.name}`,
          severity: ratio >= 0.9 ? 'critical' : 'warning',
          title: `${stream.config.name} storage ${Math.round(ratio * 100)}% full`,
          detail: `${formatBytes(stream.state.bytes)} of ${formatBytes(stream.config.max_bytes ?? 0)} configured max bytes.`,
          href: `/dashboard/streams/${encodeURIComponent(stream.config.name)}`,
          source: 'Streams',
        });
      }

      if (
        stream.config.retention === 'workqueue' &&
        stream.state.messages > 0 &&
        stream.state.consumer_count === 0
      ) {
        items.push({
          id: `workqueue-no-consumers-${stream.config.name}`,
          severity: 'warning',
          title: `${stream.config.name} has no consumers`,
          detail: `${formatNumber(stream.state.messages)} workqueue message${stream.state.messages === 1 ? '' : 's'} have no consumer.`,
          href: `/dashboard/streams/${encodeURIComponent(stream.config.name)}`,
          source: 'Streams',
        });
      }
    });

    consumerDiagnostics?.consumers
      .filter((consumer) => consumer.severity !== 'ok')
      .slice(0, 8)
      .forEach((consumer) => {
        const firstIssue = consumer.issues[0];
        const severity: AttentionSeverity =
          consumer.severity === 'critical'
            ? 'critical'
            : consumer.severity === 'warning'
              ? 'warning'
              : 'info';
        items.push({
          id: `consumer-${consumer.stream_name}-${consumer.name}`,
          severity,
          title: `${consumer.stream_name} / ${consumer.name}`,
          detail:
            firstIssue?.message ||
            `Lag ${formatNumber(consumer.stream_lag)}, pending ${formatNumber(consumer.num_pending)}.`,
          href: `/dashboard/consumers/${encodeURIComponent(consumer.stream_name)}/${encodeURIComponent(consumer.name)}`,
          source: 'Consumers',
        });
      });

    return items.sort((a, b) => {
      const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.title.localeCompare(b.title);
    });
  }, [clusterData, consumerDiagnostics?.consumers, streamsData?.streams]);

  const problemCounts = useMemo(
    () => ({
      critical: attentionItems.filter((item) => item.severity === 'critical').length,
      warning: attentionItems.filter((item) => item.severity === 'warning').length,
      info: attentionItems.filter((item) => item.severity === 'info').length,
    }),
    [attentionItems],
  );
  const clusterRisk =
    (clusterData?.leaderless_streams ?? 0) + (clusterData?.quorum_degraded_streams ?? 0);
  const consumerIssues =
    (consumerDiagnostics?.summary.critical ?? 0) + (consumerDiagnostics?.summary.warning ?? 0);
  const maxConsumerLag = consumerDiagnostics?.summary.max_stream_lag ?? 0;

  const stats = [
    {
      label: 'Streams',
      value: formatNumber(totalStreams),
      icon: Layers,
      metric: 'streams' as const,
    },
    {
      label: 'Messages',
      value: formatNumber(totalMessages),
      icon: MessageSquare,
      metric: 'messages' as const,
    },
    {
      label: 'Storage',
      value: formatBytes(totalBytes),
      icon: HardDrive,
      metric: 'storage' as const,
    },
    {
      label: 'Consumers',
      value: formatNumber(totalConsumers),
      icon: Users,
      metric: 'consumers' as const,
    },
  ];

  const isAttentionLoading = isLoading || isClusterLoading || isDiagnosticsLoading;
  const isAnyFetching = isFetching || isClusterFetching || isDiagnosticsFetching;
  const refreshAll = () => {
    void refetch();
    void refetchCluster();
    void refetchDiagnostics();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Dashboard Overview"
        description="Monitor your NATS JetStream cluster"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isAnyFetching}
            onRefresh={refreshAll}
          />
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Attention Needed</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cluster, stream, and consumer conditions ranked by severity.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={problemCounts.critical > 0 ? 'destructive' : 'outline'}>
              {problemCounts.critical} critical
            </Badge>
            <Badge variant={problemCounts.warning > 0 ? 'warning' : 'outline'}>
              {problemCounts.warning} warnings
            </Badge>
            <Badge variant="outline">{problemCounts.info} info</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isAttentionLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : attentionItems.length > 0 ? (
            <div className="divide-y rounded-md border">
              {attentionItems.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityBadgeVariant(item.severity)}>{item.severity}</Badge>
                      <Badge variant="outline">{item.source}</Badge>
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={item.href}>Open</Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium">No active problems detected</p>
                <p className="text-sm text-muted-foreground">
                  Current cluster, stream, and consumer checks are clear.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Cluster Risk"
          value={clusterRisk}
          icon={Network}
          metric={clusterRisk > 0 ? 'critical' : 'success'}
          tone={clusterRisk > 0 ? 'destructive' : 'default'}
        />
        <StatCard
          label="Consumer Issues"
          value={consumerIssues}
          icon={Gauge}
          metric={consumerIssues > 0 ? 'warning' : 'success'}
          tone={consumerIssues > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Max Consumer Lag"
          value={formatNumber(maxConsumerLag)}
          icon={AlertTriangle}
          metric={maxConsumerLag > 0 ? 'warning' : 'success'}
          tone={maxConsumerLag > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Recent Streams */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Streams</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : streamsData?.streams && streamsData.streams.length > 0 ? (
            <div className="space-y-4">
              {streamsData.streams.slice(0, 5).map((stream) => (
                <div
                  key={stream.config.name}
                  className="flex items-center justify-between p-4 bg-muted/40 rounded-lg"
                >
                  <div>
                    <h3 className="font-medium">{stream.config.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {stream.config.subjects.join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatNumber(stream.state.messages)} messages
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(stream.state.bytes)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No streams found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
