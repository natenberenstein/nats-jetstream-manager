'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileClock,
  HeartPulse,
  ListChecks,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { StatCard } from '@/components/cards/StatCard';
import { LastUpdated } from '@/components/ui/last-updated';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAuditEntries } from '@/hooks/useAudit';
import { useConsumerDiagnostics } from '@/hooks/useConsumers';
import { useHealthHistory, useUptimeSummary } from '@/hooks/useHealth';
import { useJobs } from '@/hooks/useJobs';
import { formatNumber } from '@/lib/utils';

type TimelineTone = 'default' | 'success' | 'warning' | 'destructive' | 'outline';

interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
  meta?: string;
  tone: TimelineTone;
  icon: LucideIcon;
  href?: string;
}

function badgeVariant(tone: TimelineTone) {
  if (tone === 'destructive') return 'destructive';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'success';
  if (tone === 'outline') return 'outline';
  return 'secondary';
}

function auditTone(action: string): TimelineTone {
  const normalized = action.toLowerCase();
  if (/(delete|destroy|purge|cancel|failed|erase|term)/.test(normalized)) return 'destructive';
  if (/(update|replay|publish|remediation)/.test(normalized)) return 'warning';
  if (/(create|connect|success|completed)/.test(normalized)) return 'success';
  return 'outline';
}

function jobTone(status: string): TimelineTone {
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  if (status === 'running' || status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  return 'outline';
}

function diagnosticTone(severity: string): TimelineTone {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'outline';
}

function eventIconClass(tone: TimelineTone) {
  if (tone === 'destructive') return 'bg-destructive/10 text-destructive';
  if (tone === 'warning') return 'bg-warning/10 text-warning';
  if (tone === 'success') return 'bg-success/10 text-success';
  return 'bg-muted text-muted-foreground';
}

export default function OperationsPage() {
  const { connectionId } = useConnection();
  const {
    data: auditData,
    isFetching: auditFetching,
    dataUpdatedAt: auditUpdatedAt,
    refetch: refetchAudit,
  } = useAuditEntries({ limit: 40 });
  const {
    data: jobsData,
    isFetching: jobsFetching,
    dataUpdatedAt: jobsUpdatedAt,
    refetch: refetchJobs,
  } = useJobs(connectionId, !!connectionId);
  const {
    data: healthData,
    isFetching: healthFetching,
    dataUpdatedAt: healthUpdatedAt,
    refetch: refetchHealth,
  } = useHealthHistory(connectionId, 24);
  const {
    data: uptimeData,
    isFetching: uptimeFetching,
    refetch: refetchUptime,
  } = useUptimeSummary(connectionId, 24);
  const {
    data: diagnosticsData,
    isFetching: diagnosticsFetching,
    dataUpdatedAt: diagnosticsUpdatedAt,
    refetch: refetchDiagnostics,
  } = useConsumerDiagnostics(connectionId);

  const timeline = useMemo<TimelineEvent[]>(() => {
    const auditEvents: TimelineEvent[] = (auditData?.entries ?? []).map((entry) => ({
      id: `audit-${entry.id}`,
      time: entry.created_at,
      title: entry.action,
      detail: [entry.resource_type, entry.resource_name].filter(Boolean).join(' / ') || 'audit',
      meta: entry.user_email ?? entry.user_id?.toString() ?? undefined,
      tone: auditTone(entry.action),
      icon: FileClock,
      href: '/dashboard/audit',
    }));

    const jobEvents: TimelineEvent[] = (jobsData?.jobs ?? []).map((job) => ({
      id: `job-${job.id}`,
      time: job.completed_at ?? job.started_at ?? job.created_at,
      title: `${job.job_type} ${job.status}`,
      detail: job.message ?? job.error ?? `Progress ${job.progress}%`,
      meta: job.id.slice(0, 8),
      tone: jobTone(job.status),
      icon: job.status === 'running' || job.status === 'pending' ? Loader2 : ListChecks,
    }));

    const healthChecks = [...(healthData?.checks ?? [])].sort(
      (left, right) => Date.parse(right.checked_at) - Date.parse(left.checked_at),
    );
    const healthEvents: TimelineEvent[] = healthChecks
      .filter((check, index) => check.status === 'down' || index === 0)
      .slice(0, 10)
      .map((check, index) => ({
        id: `health-${check.checked_at}-${index}`,
        time: check.checked_at,
        title: check.status === 'up' ? 'Connection healthy' : 'Connection down',
        detail: check.error ?? `JetStream ${check.jetstream_ok ? 'ok' : 'not ok'}`,
        tone: check.status === 'up' && check.jetstream_ok ? 'success' : 'destructive',
        icon: check.status === 'up' && check.jetstream_ok ? CheckCircle2 : XCircle,
        href: '/dashboard/health',
      }));

    const diagnosticEvents: TimelineEvent[] = (diagnosticsData?.consumers ?? [])
      .filter((consumer) => consumer.severity !== 'ok')
      .slice(0, 12)
      .map((consumer) => ({
        id: `diagnostic-${consumer.stream_name}-${consumer.name}-${consumer.severity}`,
        time: diagnosticsData?.generated_at ?? new Date().toISOString(),
        title: `${consumer.stream_name} / ${consumer.name}`,
        detail:
          consumer.issues[0]?.recommendation ??
          consumer.issues[0]?.message ??
          `${consumer.num_pending} pending, ${consumer.num_ack_pending} ack pending`,
        meta: consumer.severity,
        tone: diagnosticTone(consumer.severity),
        icon: AlertTriangle,
        href: `/dashboard/consumers?stream=${encodeURIComponent(consumer.stream_name)}`,
      }));

    return [...auditEvents, ...jobEvents, ...healthEvents, ...diagnosticEvents]
      .filter((event) => event.time && !Number.isNaN(Date.parse(event.time)))
      .sort((left, right) => Date.parse(right.time) - Date.parse(left.time))
      .slice(0, 80);
  }, [
    auditData?.entries,
    diagnosticsData?.consumers,
    diagnosticsData?.generated_at,
    healthData?.checks,
    jobsData?.jobs,
  ]);

  const activeJobs = (jobsData?.jobs ?? []).filter((job) =>
    ['pending', 'running'].includes(job.status),
  ).length;
  const riskyAuditActions = (auditData?.entries ?? []).filter(
    (entry) => auditTone(entry.action) === 'destructive',
  ).length;
  const unhealthyConsumers = diagnosticsData?.summary
    ? diagnosticsData.summary.warning + diagnosticsData.summary.critical
    : 0;
  const latestUpdatedAt = Math.max(
    auditUpdatedAt,
    jobsUpdatedAt,
    healthUpdatedAt,
    diagnosticsUpdatedAt,
  );
  const isFetching =
    auditFetching || jobsFetching || healthFetching || uptimeFetching || diagnosticsFetching;

  const refreshAll = () => {
    void Promise.all([
      refetchAudit(),
      refetchJobs(),
      refetchHealth(),
      refetchUptime(),
      refetchDiagnostics(),
    ]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Operations Timeline"
        description="Recent health, job, audit, and consumer-risk events"
        meta={
          <LastUpdated timestamp={latestUpdatedAt} isFetching={isFetching} onRefresh={refreshAll} />
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Uptime"
          value={uptimeData ? `${uptimeData.uptime_pct.toFixed(1)}%` : '-'}
          icon={HeartPulse}
          metric="success"
          isLoading={!uptimeData}
        />
        <StatCard
          label="Consumer Risks"
          value={formatNumber(unhealthyConsumers)}
          icon={ShieldAlert}
          metric="consumers"
          isLoading={!diagnosticsData}
        />
        <StatCard
          label="Active Jobs"
          value={formatNumber(activeJobs)}
          icon={Activity}
          metric="messages"
          isLoading={!jobsData}
        />
        <StatCard
          label="Risky Actions"
          value={formatNumber(riskyAuditActions)}
          icon={FileClock}
          metric="sequence"
          isLoading={!auditData}
        />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock3 className="h-4 w-4" />
            Recent Events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {timeline.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No recent events.</div>
          ) : (
            <div className="divide-y">
              {timeline.map((event) => {
                const Icon = event.icon;
                const row = (
                  <div className="flex min-w-0 items-start gap-3 p-4">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${eventIconClass(event.tone)}`}
                    >
                      <Icon
                        className={`h-4 w-4 ${Icon === Loader2 ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{event.title}</p>
                        <Badge variant={badgeVariant(event.tone)} className="rounded-md">
                          {event.tone === 'destructive' ? 'risk' : event.tone}
                        </Badge>
                      </div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {event.detail}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(event.time).toLocaleString()}</span>
                        {event.meta && <span className="font-mono">{event.meta}</span>}
                      </div>
                    </div>
                    {event.href && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={event.href}>Open</Link>
                      </Button>
                    )}
                  </div>
                );

                return <div key={event.id}>{row}</div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
