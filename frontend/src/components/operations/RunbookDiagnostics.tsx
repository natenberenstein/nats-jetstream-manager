'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HardDrive,
  Info,
  ListChecks,
  MessageSquare,
  Network,
  ShieldAlert,
  Users,
} from 'lucide-react';

import type { EntityDetailTarget } from '@/components/operations/EntityDetailDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnection } from '@/contexts/ConnectionContext';
import { useClusterOverview } from '@/hooks/useCluster';
import { useConsumerDiagnostics } from '@/hooks/useConsumers';
import { useStreams } from '@/hooks/useStreams';
import type { ClusterOverview, ConsumerDiagnostic, StreamInfo } from '@/lib/types';
import { cn, formatBytes, formatNumber } from '@/lib/utils';

type RunbookSeverity = 'critical' | 'warning' | 'info';

interface RunbookItem {
  id: string;
  severity: RunbookSeverity;
  source: string;
  title: string;
  likelyCause: string;
  impact: string;
  nextStep: string;
  href: string;
  actionLabel: string;
  target?: EntityDetailTarget;
}

interface RunbookDiagnosticsProps {
  limit?: number;
  compact?: boolean;
  onOpenEntity?: (target: EntityDetailTarget) => void;
  className?: string;
}

const SEVERITY_RANK: Record<RunbookSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function severityBadgeVariant(severity: RunbookSeverity) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'outline';
}

function itemBorderClass(severity: RunbookSeverity) {
  if (severity === 'critical') return 'border-l-destructive bg-destructive/5';
  if (severity === 'warning') return 'border-l-warning bg-warning/5';
  return 'border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/20';
}

function storageRatio(stream: StreamInfo) {
  const maxBytes = stream.config.max_bytes ?? -1;
  if (maxBytes <= 0) return null;
  return stream.state.bytes / maxBytes;
}

function streamHref(streamName: string) {
  return `/dashboard/streams/${encodeURIComponent(streamName)}`;
}

function remediationHref(streamName: string, consumerName: string) {
  return `/dashboard/messages?stream=${encodeURIComponent(
    streamName,
  )}&mode=remediate&consumer=${encodeURIComponent(consumerName)}`;
}

function buildClusterItems(cluster?: ClusterOverview): RunbookItem[] {
  if (!cluster) return [];

  const items: RunbookItem[] = [];

  if (cluster.leaderless_streams > 0) {
    items.push({
      id: 'cluster-leaderless',
      severity: 'critical',
      source: 'Cluster',
      title: `${cluster.leaderless_streams} leaderless stream${cluster.leaderless_streams === 1 ? '' : 's'}`,
      likelyCause: 'A stream replica group cannot currently elect or report a leader.',
      impact: 'Writes, reads, or consumer operations can fail for affected replicated streams.',
      nextStep: 'Open cluster details, identify affected streams, and check node availability.',
      href: '/dashboard/cluster',
      actionLabel: 'Inspect cluster',
      target: { type: 'cluster' },
    });
  }

  if (cluster.quorum_degraded_streams > 0) {
    items.push({
      id: 'cluster-quorum',
      severity: 'critical',
      source: 'Cluster',
      title: `${cluster.quorum_degraded_streams} quorum-degraded stream${cluster.quorum_degraded_streams === 1 ? '' : 's'}`,
      likelyCause: 'One or more replicated streams have too few online replicas.',
      impact: 'Another node loss may make stream state unavailable or block writes.',
      nextStep: 'Review offline and lagging replicas before changing stream placement.',
      href: '/dashboard/cluster',
      actionLabel: 'Inspect cluster',
      target: { type: 'cluster' },
    });
  }

  if (cluster.mixed_versions) {
    items.push({
      id: 'cluster-mixed-versions',
      severity: 'warning',
      source: 'Cluster',
      title: 'Mixed server versions',
      likelyCause: 'The discovered NATS servers are not all running the same version.',
      impact: 'Feature support and JetStream behavior can differ across nodes during operations.',
      nextStep: 'Finish the rolling upgrade or verify version skew is expected.',
      href: '/dashboard/cluster',
      actionLabel: 'Inspect cluster',
      target: { type: 'cluster' },
    });
  }

  cluster.stream_health
    .filter((stream) => !stream.healthy)
    .forEach((stream) => {
      const reasons = [
        !stream.has_quorum ? 'missing quorum' : null,
        stream.offline_replicas > 0
          ? `${stream.offline_replicas} offline replica${stream.offline_replicas === 1 ? '' : 's'}`
          : null,
        stream.lagging_replicas > 0
          ? `${stream.lagging_replicas} lagging replica${stream.lagging_replicas === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean);

      items.push({
        id: `stream-health-${stream.stream}`,
        severity: stream.has_quorum ? 'warning' : 'critical',
        source: 'Replication',
        title: `${stream.stream} replication degraded`,
        likelyCause: reasons.join(', ') || 'Replication state is not healthy.',
        impact: 'Durability or availability for this stream is reduced.',
        nextStep: 'Inspect the stream and cluster node status before purging or editing it.',
        href: streamHref(stream.stream),
        actionLabel: 'Inspect stream',
        target: { type: 'stream', name: stream.stream },
      });
    });

  return items;
}

function buildStreamItems(streams: StreamInfo[]): RunbookItem[] {
  const items: RunbookItem[] = [];

  streams.forEach((stream) => {
    const ratio = storageRatio(stream);
    if (ratio !== null && ratio >= 0.75) {
      items.push({
        id: `stream-storage-${stream.config.name}`,
        severity: ratio >= 0.9 ? 'critical' : 'warning',
        source: 'Streams',
        title: `${stream.config.name} is ${Math.round(ratio * 100)}% full`,
        likelyCause: 'Stored bytes are approaching the configured max bytes limit.',
        impact:
          stream.config.discard === 'new'
            ? 'New publishes can be rejected when the limit is reached.'
            : 'Older messages can be evicted sooner than expected.',
        nextStep: 'Review retention, max bytes, publish rate, and consumer catch-up state.',
        href: streamHref(stream.config.name),
        actionLabel: 'Inspect stream',
        target: { type: 'stream', name: stream.config.name },
      });
    }

    if (
      stream.config.retention === 'workqueue' &&
      stream.state.messages > 0 &&
      stream.state.consumer_count === 0
    ) {
      items.push({
        id: `workqueue-no-consumer-${stream.config.name}`,
        severity: 'warning',
        source: 'Streams',
        title: `${stream.config.name} has queued work but no consumers`,
        likelyCause: 'Workqueue retention expects consumers to acknowledge stored work.',
        impact: `${formatNumber(stream.state.messages)} message${stream.state.messages === 1 ? '' : 's'} have no active ownership path.`,
        nextStep: 'Create or reconnect the worker consumer before publishing more work.',
        href: streamHref(stream.config.name),
        actionLabel: 'Inspect stream',
        target: { type: 'stream', name: stream.config.name },
      });
    }

    const unboundedMemory =
      stream.config.storage === 'memory' &&
      (stream.config.max_bytes ?? -1) <= 0 &&
      (stream.config.max_msgs ?? -1) <= 0 &&
      (stream.config.max_age ?? 0) <= 0;
    if (unboundedMemory) {
      items.push({
        id: `memory-unbounded-${stream.config.name}`,
        severity: 'critical',
        source: 'Streams',
        title: `${stream.config.name} has unbounded memory storage`,
        likelyCause: 'The stream uses memory storage without byte, message, or age limits.',
        impact: `The stream currently holds ${formatBytes(stream.state.bytes)} in process memory.`,
        nextStep: 'Add a storage limit or move the stream to file storage for durable workloads.',
        href: streamHref(stream.config.name),
        actionLabel: 'Inspect stream',
        target: { type: 'stream', name: stream.config.name },
      });
    }

    if (stream.config.retention === 'interest' && stream.state.consumer_count === 0) {
      items.push({
        id: `interest-no-consumer-${stream.config.name}`,
        severity: 'info',
        source: 'Streams',
        title: `${stream.config.name} uses interest retention with no consumers`,
        likelyCause: 'Interest retention only keeps messages while matching consumers need them.',
        impact: 'Messages published before a matching consumer exists may not be retained.',
        nextStep: 'Create consumers first if late inspection or replay is required.',
        href: streamHref(stream.config.name),
        actionLabel: 'Inspect stream',
        target: { type: 'stream', name: stream.config.name },
      });
    }
  });

  return items;
}

function buildConsumerItems(consumers: ConsumerDiagnostic[]): RunbookItem[] {
  return consumers
    .filter((consumer) => consumer.severity !== 'ok')
    .map((consumer) => {
      const firstIssue = consumer.issues[0];
      const severity = consumer.severity === 'critical' ? 'critical' : 'warning';
      const pending = formatNumber(consumer.num_pending);
      const ackPending = formatNumber(consumer.num_ack_pending);

      return {
        id: `consumer-${consumer.stream_name}-${consumer.name}`,
        severity,
        source: 'Consumers',
        title: `${consumer.stream_name} / ${consumer.name}`,
        likelyCause:
          firstIssue?.message ??
          `${pending} pending, ${ackPending} ack pending, ${formatNumber(
            consumer.stream_lag,
          )} stream lag.`,
        impact:
          consumer.num_ack_pending > 0
            ? 'Messages may redeliver when ack wait expires or workers restart.'
            : 'Consumers may be falling behind the stream head.',
        nextStep:
          firstIssue?.recommendation ??
          'Inspect the consumer and use remediation when pending messages need explicit handling.',
        href: remediationHref(consumer.stream_name, consumer.name),
        actionLabel: consumer.type === 'pull' ? 'Remediate' : 'Inspect consumer',
        target: {
          type: 'consumer',
          streamName: consumer.stream_name,
          name: consumer.name,
        },
      } satisfies RunbookItem;
    });
}

function buildRunbookItems({
  cluster,
  streams,
  consumers,
}: {
  cluster?: ClusterOverview;
  streams: StreamInfo[];
  consumers: ConsumerDiagnostic[];
}) {
  return [
    ...buildClusterItems(cluster),
    ...buildStreamItems(streams),
    ...buildConsumerItems(consumers),
  ].sort((left, right) => {
    const severityDiff = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
    if (severityDiff !== 0) return severityDiff;
    return left.title.localeCompare(right.title);
  });
}

export function RunbookDiagnostics({
  limit = 6,
  compact = false,
  onOpenEntity,
  className,
}: RunbookDiagnosticsProps) {
  const { connectionId } = useConnection();
  const { data: streamsData, isLoading: streamsLoading } = useStreams(connectionId);
  const { data: clusterData, isLoading: clusterLoading } = useClusterOverview(connectionId);
  const { data: diagnosticsData, isLoading: diagnosticsLoading } =
    useConsumerDiagnostics(connectionId);

  const isLoading = streamsLoading || clusterLoading || diagnosticsLoading;
  const items = buildRunbookItems({
    cluster: clusterData,
    streams: streamsData?.streams ?? [],
    consumers: diagnosticsData?.consumers ?? [],
  });
  const visibleItems = items.slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader className={cn('border-b', compact && 'px-4 py-3')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="h-4 w-4" />
            Runbook Diagnostics
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                items.some((item) => item.severity === 'critical') ? 'destructive' : 'outline'
              }
            >
              {items.filter((item) => item.severity === 'critical').length} critical
            </Badge>
            <Badge
              variant={items.some((item) => item.severity === 'warning') ? 'warning' : 'outline'}
            >
              {items.filter((item) => item.severity === 'warning').length} warning
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn('space-y-3', compact ? 'p-4' : 'p-5')}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: compact ? 2 : 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <p className="font-medium">No runbook actions needed</p>
              <p className="text-sm text-muted-foreground">
                Cluster, stream, and consumer diagnostics are clear for the current snapshot.
              </p>
            </div>
          </div>
        ) : (
          visibleItems.map((item) => {
            const SourceIcon =
              item.source === 'Cluster'
                ? Network
                : item.source === 'Consumers'
                  ? Users
                  : item.source === 'Streams'
                    ? MessageSquare
                    : HardDrive;
            const SeverityIcon = item.severity === 'critical' ? ShieldAlert : AlertTriangle;

            return (
              <div
                key={item.id}
                className={cn('rounded-md border border-l-4 p-4', itemBorderClass(item.severity))}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityIcon className="h-4 w-4 text-muted-foreground" />
                      <Badge variant={severityBadgeVariant(item.severity)} className="rounded-md">
                        {item.severity}
                      </Badge>
                      <Badge variant="outline" className="gap-1 rounded-md">
                        <SourceIcon className="h-3 w-3" />
                        {item.source}
                      </Badge>
                      <p className="font-medium">{item.title}</p>
                    </div>

                    <div className="grid gap-2 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Likely cause
                        </p>
                        <p className="mt-1">{item.likelyCause}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Impact
                        </p>
                        <p className="mt-1">{item.impact}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">
                          Next step
                        </p>
                        <p className="mt-1">{item.nextStep}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {item.target && onOpenEntity && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (item.target) onOpenEntity(item.target);
                        }}
                      >
                        <Info className="h-4 w-4" />
                        Details
                      </Button>
                    )}
                    <Button size="sm" asChild>
                      <Link href={item.href}>
                        <ExternalLink className="h-4 w-4" />
                        {item.actionLabel}
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {items.length > visibleItems.length && (
          <div className="text-sm text-muted-foreground">
            Showing {visibleItems.length} of {items.length} diagnostics. Open Operations for the
            full triage list.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
