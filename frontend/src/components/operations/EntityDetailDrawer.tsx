'use client';

import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GitBranch,
  HardDrive,
  Info,
  Layers,
  MessageSquare,
  Network,
  Users,
} from 'lucide-react';

import { StreamConfigAdvisor } from '@/components/operations/StreamConfigAdvisor';
import { SubjectChips } from '@/components/subjects/SubjectChips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAuditEntries } from '@/hooks/useAudit';
import { useClusterOverview } from '@/hooks/useCluster';
import { useConsumer, useConsumerDiagnostics, useConsumerMetric } from '@/hooks/useConsumers';
import { useStreamMetrics } from '@/hooks/useMetrics';
import { useStream } from '@/hooks/useStreams';
import type {
  AuditLogEntry,
  ClusterStreamHealth,
  ConsumerDiagnostic,
  ConsumerInfo,
  StreamInfo,
} from '@/lib/types';
import { cn, formatBytes, formatNanoseconds, formatNumber, formatRelativeTime } from '@/lib/utils';

export type EntityDetailTarget =
  | { type: 'cluster'; name?: string }
  | { type: 'stream'; name: string }
  | { type: 'consumer'; streamName: string; name: string };

interface EntityDetailDrawerProps {
  target: EntityDetailTarget | null;
  onClose: () => void;
}

type BadgeTone = 'destructive' | 'warning' | 'success' | 'outline' | 'secondary';

function formatLimit(value?: number, formatter: (value: number) => string = formatNumber) {
  if (value === undefined || value < 0) return 'Unlimited';
  if (value === 0) return 'Disabled';
  return formatter(value);
}

function formatSeconds(seconds?: number) {
  if (seconds === undefined || seconds <= 0) return 'Unlimited';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function storageRatio(stream?: StreamInfo) {
  const maxBytes = stream?.config.max_bytes ?? -1;
  if (!stream || maxBytes <= 0) return null;
  return Math.min(100, (stream.state.bytes / maxBytes) * 100);
}

function severityVariant(severity?: string): BadgeTone {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'ok' || severity === 'healthy') return 'success';
  return 'outline';
}

function DetailMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{label}</span>
      </div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words font-medium">{children}</div>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AuditList({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <EmptyPanel>No recent audit entries matched this resource.</EmptyPanel>;
  }

  return (
    <div className="divide-y rounded-md border">
      {entries.slice(0, 8).map((entry) => (
        <div key={entry.id} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md">
              {entry.action}
            </Badge>
            <span className="text-sm font-medium">
              {entry.resource_name ?? entry.resource_type}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{new Date(entry.created_at).toLocaleString()}</span>
            {entry.user_email && <span>{entry.user_email}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StreamOverview({ stream }: { stream?: StreamInfo }) {
  const usedPct = storageRatio(stream);

  if (!stream) return <EmptyPanel>Stream details are loading.</EmptyPanel>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DetailMetric
          label="Messages"
          value={formatNumber(stream.state.messages)}
          icon={MessageSquare}
        />
        <DetailMetric label="Storage" value={formatBytes(stream.state.bytes)} icon={HardDrive} />
        <DetailMetric
          label="Consumers"
          value={formatNumber(stream.state.consumer_count)}
          icon={Users}
        />
        <DetailMetric
          label="Sequence"
          value={`${formatNumber(stream.state.first_seq)}-${formatNumber(stream.state.last_seq)}`}
          icon={GitBranch}
        />
      </div>

      {usedPct !== null && (
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Storage limit</span>
            <span className="text-muted-foreground">
              {usedPct.toFixed(0)}% of {formatBytes(stream.config.max_bytes ?? 0)}
            </span>
          </div>
          <Progress
            value={usedPct}
            className={cn(
              usedPct >= 90 && '[&>div]:bg-destructive',
              usedPct >= 75 && usedPct < 90 && '[&>div]:bg-warning',
            )}
          />
        </div>
      )}

      <div className="rounded-md border">
        <DetailRow label="Subjects">
          <SubjectChips subjects={stream.config.subjects} maxVisible={4} />
        </DetailRow>
        <DetailRow label="Retention">{stream.config.retention ?? 'limits'}</DetailRow>
        <DetailRow label="Storage">{stream.config.storage ?? 'file'}</DetailRow>
        <DetailRow label="Replicas">{stream.config.replicas ?? 1}</DetailRow>
        <DetailRow label="Max messages">{formatLimit(stream.config.max_msgs)}</DetailRow>
        <DetailRow label="Max bytes">{formatLimit(stream.config.max_bytes, formatBytes)}</DetailRow>
        <DetailRow label="Max age">{formatSeconds(stream.config.max_age)}</DetailRow>
        <DetailRow label="Discard">{stream.config.discard ?? 'old'}</DetailRow>
      </div>
    </div>
  );
}

function StreamHealthPanel({
  stream,
  clusterHealth,
  diagnostics,
  clusterNodeCount,
  clusterTopology,
}: {
  stream?: StreamInfo;
  clusterHealth?: ClusterStreamHealth;
  diagnostics: ConsumerDiagnostic[];
  clusterNodeCount?: number;
  clusterTopology?: 'standalone' | 'clustered';
}) {
  if (!stream) return <EmptyPanel>Stream health is loading.</EmptyPanel>;

  return (
    <div className="space-y-4">
      <StreamConfigAdvisor
        config={stream.config}
        state={stream.state}
        consumerCount={stream.state.consumer_count}
        clusterNodeCount={clusterNodeCount}
        clusterTopology={clusterTopology}
      />

      {clusterHealth && (
        <div className="rounded-md border">
          <DetailRow label="Replication">
            <Badge variant={clusterHealth.healthy ? 'success' : 'warning'} className="rounded-md">
              {clusterHealth.healthy ? 'healthy' : 'degraded'}
            </Badge>
          </DetailRow>
          <DetailRow label="Leader">{clusterHealth.leader ?? 'Unknown'}</DetailRow>
          <DetailRow label="Online replicas">
            {clusterHealth.online_replicas} of {clusterHealth.replicas}
          </DetailRow>
          <DetailRow label="Offline replicas">{clusterHealth.offline_replicas}</DetailRow>
          <DetailRow label="Lagging replicas">{clusterHealth.lagging_replicas}</DetailRow>
          <DetailRow label="Quorum">{clusterHealth.has_quorum ? 'Available' : 'Missing'}</DetailRow>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Consumer diagnostics</h3>
        {diagnostics.length === 0 ? (
          <EmptyPanel>No consumer issues were reported for this stream.</EmptyPanel>
        ) : (
          <div className="space-y-2">
            {diagnostics.slice(0, 5).map((diagnostic) => (
              <div key={diagnostic.name} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(diagnostic.severity)} className="rounded-md">
                    {diagnostic.severity}
                  </Badge>
                  <span className="font-medium">{diagnostic.name}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {diagnostic.issues[0]?.message ??
                    `${formatNumber(diagnostic.stream_lag)} stream lag`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConsumerOverview({
  consumer,
  diagnostic,
}: {
  consumer?: ConsumerInfo;
  diagnostic?: ConsumerDiagnostic;
}) {
  if (!consumer && !diagnostic) return <EmptyPanel>Consumer details are loading.</EmptyPanel>;

  const detail = consumer ?? diagnostic;
  const config = consumer?.config;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DetailMetric
          label="Pending"
          value={formatNumber(detail?.num_pending ?? 0)}
          icon={MessageSquare}
        />
        <DetailMetric
          label="Ack pending"
          value={formatNumber(detail?.num_ack_pending ?? 0)}
          icon={Clock3}
        />
        <DetailMetric label="Waiting" value={formatNumber(detail?.num_waiting ?? 0)} icon={Users} />
        <DetailMetric
          label="Stream lag"
          value={formatNumber(diagnostic?.stream_lag ?? 0)}
          icon={BarChart3}
        />
      </div>

      {diagnostic && (
        <div className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={severityVariant(diagnostic.severity)} className="rounded-md">
              {diagnostic.severity}
            </Badge>
            <span className="font-medium">Diagnostic status</span>
          </div>
          {diagnostic.issues.length > 0 && (
            <div className="mt-3 space-y-2">
              {diagnostic.issues.map((issue) => (
                <div key={issue.code} className="rounded-md bg-muted/50 p-2 text-sm">
                  <p className="font-medium">{issue.message}</p>
                  <p className="mt-1 text-muted-foreground">{issue.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <DetailRow label="Stream">{detail?.stream_name}</DetailRow>
        <DetailRow label="Type">
          {diagnostic?.type ?? (config?.deliver_subject ? 'push' : 'pull')}
        </DetailRow>
        <DetailRow label="Filter">
          {diagnostic?.filter_subject ?? config?.filter_subject ?? '-'}
        </DetailRow>
        <DetailRow label="Deliver policy">
          {diagnostic?.deliver_policy ?? config?.deliver_policy ?? '-'}
        </DetailRow>
        <DetailRow label="Ack policy">
          {diagnostic?.ack_policy ?? config?.ack_policy ?? '-'}
        </DetailRow>
        <DetailRow label="Ack wait">
          {diagnostic?.ack_wait_ns ? formatNanoseconds(diagnostic.ack_wait_ns) : '-'}
        </DetailRow>
        <DetailRow label="Max ack pending">
          {formatLimit(diagnostic?.max_ack_pending ?? config?.max_ack_pending)}
        </DetailRow>
        <DetailRow label="Max deliver">
          {formatLimit(diagnostic?.max_deliver ?? config?.max_deliver)}
        </DetailRow>
      </div>
    </div>
  );
}

function ConsumerHealthPanel({
  consumer,
  diagnostic,
}: {
  consumer?: ConsumerInfo;
  diagnostic?: ConsumerDiagnostic;
}) {
  if (!consumer && !diagnostic) return <EmptyPanel>Consumer health is loading.</EmptyPanel>;

  const pending = diagnostic?.num_pending ?? consumer?.num_pending ?? 0;
  const ackPending = diagnostic?.num_ack_pending ?? consumer?.num_ack_pending ?? 0;
  const waiting = diagnostic?.num_waiting ?? consumer?.num_waiting ?? 0;
  const maxAckPending = diagnostic?.max_ack_pending ?? consumer?.config.max_ack_pending;
  const maxWaiting = diagnostic?.max_waiting ?? consumer?.config.max_waiting;
  const ackPressure =
    maxAckPending && maxAckPending > 0 ? Math.min(100, (ackPending / maxAckPending) * 100) : null;
  const waitingPressure =
    maxWaiting && maxWaiting > 0 ? Math.min(100, (waiting / maxWaiting) * 100) : null;
  const deliveredStreamSeq = diagnostic?.delivered_stream_seq ?? consumer?.delivered.stream_seq;
  const ackFloorStreamSeq = diagnostic?.ack_floor_stream_seq ?? consumer?.ack_floor.stream_seq;
  const lastStreamSeq = diagnostic?.last_stream_seq;
  const status = diagnostic?.severity ?? 'unknown';
  const healthy = status === 'ok';
  const issues = diagnostic?.issues ?? [];

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-md border p-3',
          healthy
            ? 'border-success/30 bg-success/10'
            : status === 'critical'
              ? 'border-destructive/40 bg-destructive/5'
              : status === 'warning'
                ? 'border-warning/40 bg-warning/5'
                : 'bg-muted/30',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {healthy ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          <span className="font-medium">
            {healthy
              ? 'Consumer health is clear'
              : diagnostic
                ? 'Consumer health needs attention'
                : 'Diagnostic snapshot unavailable'}
          </span>
          <Badge variant={severityVariant(status)} className="rounded-md">
            {status}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {healthy
            ? 'No lag, acknowledgement, or waiting pressure issues were reported.'
            : diagnostic
              ? 'Use this view to separate backlog, stuck acknowledgements, and consumer capacity pressure.'
              : 'The consumer exists, but no diagnostic result was returned for it yet.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailMetric
          label="Stream lag"
          value={formatNumber(diagnostic?.stream_lag ?? 0)}
          detail="Messages between delivered position and stream head"
          icon={BarChart3}
        />
        <DetailMetric
          label="Unacked span"
          value={formatNumber(diagnostic?.unacked_span ?? 0)}
          detail="Gap between delivered and ack floor"
          icon={Clock3}
        />
        <DetailMetric
          label="Pending"
          value={formatNumber(pending)}
          detail="Messages available to the consumer"
          icon={MessageSquare}
        />
        <DetailMetric
          label="Ack pending"
          value={formatNumber(ackPending)}
          detail={
            maxAckPending && maxAckPending > 0 ? `Limit ${formatNumber(maxAckPending)}` : undefined
          }
          icon={Clock3}
        />
      </div>

      {(ackPressure !== null || waitingPressure !== null) && (
        <div className="space-y-3 rounded-md border p-3">
          {ackPressure !== null && (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Ack pending pressure</span>
                <span className="text-muted-foreground">{ackPressure.toFixed(0)}%</span>
              </div>
              <Progress
                value={ackPressure}
                className={cn(
                  ackPressure >= 90 && '[&>div]:bg-destructive',
                  ackPressure >= 70 && ackPressure < 90 && '[&>div]:bg-warning',
                )}
              />
            </div>
          )}
          {waitingPressure !== null && (
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Waiting request pressure</span>
                <span className="text-muted-foreground">{waitingPressure.toFixed(0)}%</span>
              </div>
              <Progress
                value={waitingPressure}
                className={cn(
                  waitingPressure >= 90 && '[&>div]:bg-destructive',
                  waitingPressure >= 70 && waitingPressure < 90 && '[&>div]:bg-warning',
                )}
              />
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <DetailRow label="Delivered stream seq">{deliveredStreamSeq ?? '-'}</DetailRow>
        <DetailRow label="Ack floor stream seq">{ackFloorStreamSeq ?? '-'}</DetailRow>
        <DetailRow label="Last stream seq">{lastStreamSeq ?? '-'}</DetailRow>
        <DetailRow label="Max ack pending">{formatLimit(maxAckPending)}</DetailRow>
        <DetailRow label="Max waiting">{formatLimit(maxWaiting)}</DetailRow>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Runbook guidance</h3>
        {issues.length > 0 ? (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div key={issue.code} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(issue.severity)} className="rounded-md">
                    {issue.severity}
                  </Badge>
                  <span className="font-medium">{issue.message}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{issue.recommendation}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel>
            No diagnostic issues were reported. If the consumer still looks stale, compare delivered
            sequence, ack floor, and recent message publish activity.
          </EmptyPanel>
        )}
      </div>
    </div>
  );
}

function ClusterOverviewPanel({ healthy, warnings }: { healthy: boolean; warnings: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {healthy ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" />
        )}
        <span className="font-medium">
          {healthy ? 'No cluster risks detected' : 'Cluster risks detected'}
        </span>
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="rounded-md bg-muted/50 p-2 text-sm">
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EntityDetailDrawer({ target, onClose }: EntityDetailDrawerProps) {
  const { connectionId } = useConnection();
  const streamName =
    target?.type === 'stream'
      ? target.name
      : target?.type === 'consumer'
        ? target.streamName
        : null;
  const consumerName = target?.type === 'consumer' ? target.name : null;
  const resourceType =
    target?.type === 'stream' ? 'stream' : target?.type === 'consumer' ? 'consumer' : undefined;
  const resourceName =
    target?.type === 'stream' ? target.name : target?.type === 'consumer' ? target.name : null;

  const { data: clusterData } = useClusterOverview(connectionId);
  const { data: streamData } = useStream(connectionId, streamName);
  const { data: consumerData } = useConsumer(connectionId, streamName, consumerName);
  const { data: diagnosticsData } = useConsumerDiagnostics(connectionId, streamName);
  const { data: auditData } = useAuditEntries({ limit: 80, resourceType });
  const { data: streamMetrics } = useStreamMetrics(connectionId, streamName ?? '', 60);
  const { data: consumerMetrics } = useConsumerMetric(connectionId, streamName, consumerName, 60);

  const stream = streamData ?? undefined;
  const consumer = consumerData ?? undefined;
  const streamDiagnostics = diagnosticsData?.consumers ?? [];
  const consumerDiagnostic = streamDiagnostics.find((item) => item.name === consumerName);
  const clusterHealth = clusterData?.stream_health.find((item) => item.stream === streamName);
  const auditEntries =
    auditData?.entries.filter((entry) => !resourceName || entry.resource_name === resourceName) ??
    [];

  const title =
    target?.type === 'cluster'
      ? 'Cluster'
      : target?.type === 'stream'
        ? target.name
        : target
          ? target.name
          : 'Details';
  const description =
    target?.type === 'consumer'
      ? `Consumer on ${target.streamName}`
      : target?.type === 'stream'
        ? 'Stream details, health, activity, and quick actions'
        : 'Cluster health and topology summary';

  const streamHref = streamName ? `/dashboard/streams/${encodeURIComponent(streamName)}` : null;
  const consumerHref =
    streamName && consumerName
      ? `/dashboard/consumers/${encodeURIComponent(streamName)}/${encodeURIComponent(consumerName)}`
      : null;
  const messagesHref = streamName
    ? `/dashboard/messages?stream=${encodeURIComponent(streamName)}`
    : null;
  const remediationHref =
    streamName && consumerName
      ? `/dashboard/messages?stream=${encodeURIComponent(streamName)}&mode=remediate&consumer=${encodeURIComponent(consumerName)}`
      : null;

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-3xl">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="truncate">{title}</SheetTitle>
            {target?.type && (
              <Badge variant="outline" className="rounded-md">
                {target.type}
              </Badge>
            )}
          </div>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {streamHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={streamHref}>
                    <Layers className="h-4 w-4" />
                    Stream
                  </Link>
                </Button>
              )}
              {consumerHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={consumerHref}>
                    <Users className="h-4 w-4" />
                    Consumer
                  </Link>
                </Button>
              )}
              {messagesHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={messagesHref}>
                    <MessageSquare className="h-4 w-4" />
                    Messages
                  </Link>
                </Button>
              )}
              {remediationHref && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={remediationHref}>
                    <Activity className="h-4 w-4" />
                    Remediate
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/operations">
                  <ExternalLink className="h-4 w-4" />
                  Operations
                </Link>
              </Button>
            </div>

            {target?.type === 'cluster' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <DetailMetric
                    label="Topology"
                    value={clusterData?.topology ?? '-'}
                    detail={clusterData?.cluster_name ?? clusterData?.connected_server}
                    icon={Network}
                  />
                  <DetailMetric
                    label="Nodes"
                    value={formatNumber(clusterData?.node_count ?? 0)}
                    icon={Network}
                  />
                  <DetailMetric
                    label="Leaderless"
                    value={formatNumber(clusterData?.leaderless_streams ?? 0)}
                    icon={AlertTriangle}
                  />
                  <DetailMetric
                    label="Quorum degraded"
                    value={formatNumber(clusterData?.quorum_degraded_streams ?? 0)}
                    icon={AlertTriangle}
                  />
                </div>
                <ClusterOverviewPanel
                  healthy={
                    (clusterData?.leaderless_streams ?? 0) === 0 &&
                    (clusterData?.quorum_degraded_streams ?? 0) === 0 &&
                    !(clusterData?.mixed_versions ?? false) &&
                    (clusterData?.warnings.length ?? 0) === 0
                  }
                  warnings={[
                    ...(clusterData?.mixed_versions
                      ? ['Cluster nodes report mixed server versions.']
                      : []),
                    ...(clusterData?.warnings ?? []),
                  ]}
                />
              </div>
            ) : (
              <Tabs defaultValue="overview">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="health">Health</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  {target?.type === 'consumer' ? (
                    <ConsumerOverview consumer={consumer} diagnostic={consumerDiagnostic} />
                  ) : (
                    <StreamOverview stream={stream} />
                  )}
                </TabsContent>

                <TabsContent value="health">
                  {target?.type === 'consumer' ? (
                    <ConsumerHealthPanel consumer={consumer} diagnostic={consumerDiagnostic} />
                  ) : (
                    <StreamHealthPanel
                      stream={stream}
                      clusterHealth={clusterHealth}
                      diagnostics={streamDiagnostics.filter((item) => item.severity !== 'ok')}
                      clusterNodeCount={clusterData?.node_count}
                      clusterTopology={clusterData?.topology}
                    />
                  )}
                </TabsContent>

                <TabsContent value="activity">
                  <AuditList entries={auditEntries} />
                </TabsContent>

                <TabsContent value="metrics">
                  <div className="grid grid-cols-2 gap-3">
                    {target?.type === 'consumer' ? (
                      <>
                        <DetailMetric
                          label="Metric points"
                          value={formatNumber(consumerMetrics?.points.length ?? 0)}
                          icon={BarChart3}
                        />
                        <DetailMetric
                          label="Window"
                          value={`${consumerMetrics?.window_minutes ?? 60}m`}
                          icon={Clock3}
                        />
                        <DetailMetric
                          label="Latest pending"
                          value={formatNumber(
                            consumerMetrics?.points.at(-1)?.num_pending ??
                              consumer?.num_pending ??
                              0,
                          )}
                          icon={MessageSquare}
                        />
                        <DetailMetric
                          label="Latest ack pending"
                          value={formatNumber(
                            consumerMetrics?.points.at(-1)?.num_ack_pending ??
                              consumer?.num_ack_pending ??
                              0,
                          )}
                          icon={Clock3}
                        />
                      </>
                    ) : (
                      <>
                        <DetailMetric
                          label="Metric points"
                          value={formatNumber(streamMetrics?.points.length ?? 0)}
                          icon={BarChart3}
                        />
                        <DetailMetric
                          label="Window"
                          value={`${streamMetrics?.window_minutes ?? 60}m`}
                          icon={Clock3}
                        />
                        <DetailMetric
                          label="Latest rate"
                          value={`${formatNumber(streamMetrics?.points.at(-1)?.msg_rate ?? 0)}/s`}
                          icon={Activity}
                        />
                        <DetailMetric
                          label="Latest bytes"
                          value={formatBytes(
                            streamMetrics?.points.at(-1)?.bytes ?? stream?.state.bytes ?? 0,
                          )}
                          icon={HardDrive}
                        />
                      </>
                    )}
                  </div>
                  <div className="mt-3 rounded-md border p-3 text-sm text-muted-foreground">
                    {target?.type === 'consumer'
                      ? 'Detailed consumer charts remain available on the consumer detail page.'
                      : 'Detailed stream charts remain available on the metrics and stream detail pages.'}
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {clusterData?.generated_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Cluster snapshot generated {formatRelativeTime(clusterData.generated_at)}.
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
