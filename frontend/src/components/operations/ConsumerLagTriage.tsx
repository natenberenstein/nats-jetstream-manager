'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  MessageSquare,
  RotateCcw,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsumerDiagnostic } from '@/lib/types';
import { buildConsumerMessagesHref } from '@/lib/consumer-messages';
import {
  consumerFilterLabel,
  consumerFilterSubjects,
  singleConsumerFilterSubject,
} from '@/lib/subject-analysis';
import { cn, formatNanoseconds, formatNumber } from '@/lib/utils';

interface ConsumerLagTriageProps {
  diagnostics: ConsumerDiagnostic[];
  streamName?: string | null;
  maxItems?: number;
  title?: string;
  description?: string;
  className?: string;
}

interface TriageCause {
  label: string;
  detail: string;
  severity: ConsumerDiagnostic['severity'];
}

const SEVERITY_LABELS: Record<ConsumerDiagnostic['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  ok: 'OK',
};

function severityRank(severity: ConsumerDiagnostic['severity']) {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  if (severity === 'info') return 1;
  return 0;
}

function healthBadgeVariant(severity: ConsumerDiagnostic['severity']) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'ok') return 'success';
  return 'outline';
}

function rowClass(severity: ConsumerDiagnostic['severity']) {
  if (severity === 'critical') return 'border-l-destructive bg-destructive/5';
  if (severity === 'warning') return 'border-l-warning bg-warning/5';
  if (severity === 'ok') return 'border-l-success bg-success/5';
  return 'border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/20';
}

function hasIssue(diagnostic: ConsumerDiagnostic, code: string) {
  return diagnostic.issues.some((issue) => issue.code === code);
}

function likelyCause(diagnostic: ConsumerDiagnostic): TriageCause {
  if (hasIssue(diagnostic, 'max_ack_pending_reached')) {
    return {
      label: 'Delivery blocked at max ack pending',
      detail: 'Ack, terminate, or drain in-flight messages before raising the limit.',
      severity: 'critical',
    };
  }

  if (hasIssue(diagnostic, 'no_pull_waiters')) {
    return {
      label: 'No workers are pulling',
      detail: 'Pending messages exist but no pull requests are waiting on the server.',
      severity: diagnostic.severity === 'critical' ? 'critical' : 'warning',
    };
  }

  if (hasIssue(diagnostic, 'wide_unacked_span') || hasIssue(diagnostic, 'ack_pending')) {
    return {
      label: 'Messages are waiting for acknowledgements',
      detail:
        'Handler latency, failed acks, or an ack wait mismatch may be holding the floor back.',
      severity: diagnostic.num_ack_pending > 0 ? diagnostic.severity : 'info',
    };
  }

  if (hasIssue(diagnostic, 'push_delivery_backlog')) {
    return {
      label: 'Push delivery is backed up',
      detail: 'Check subscribers and queue group membership on the deliver subject.',
      severity: diagnostic.severity,
    };
  }

  if (
    consumerFilterSubjects(diagnostic).length > 0 &&
    diagnostic.stream_lag > 0 &&
    diagnostic.num_pending === 0 &&
    diagnostic.num_ack_pending === 0
  ) {
    return {
      label: 'Filter may not match recent subjects',
      detail: 'The stream head moved forward, but this consumer has no matching pending work.',
      severity: 'info',
    };
  }

  if (hasIssue(diagnostic, 'large_backlog') || hasIssue(diagnostic, 'backlog_growth')) {
    return {
      label: 'Workers cannot keep up',
      detail: 'Backlog is present while the stream has advanced past delivered messages.',
      severity: diagnostic.severity,
    };
  }

  if (diagnostic.severity === 'ok') {
    return {
      label: 'Consumer is caught up',
      detail: 'Delivery, ack floor, and waiting counts are within normal bounds.',
      severity: 'ok',
    };
  }

  return {
    label: diagnostic.issues[0]?.message ?? 'Consumer needs review',
    detail: diagnostic.issues[0]?.recommendation ?? 'Review delivery and acknowledgement state.',
    severity: diagnostic.severity,
  };
}

function ackWaitLabel(diagnostic: ConsumerDiagnostic) {
  return diagnostic.ack_wait_ns ? formatNanoseconds(diagnostic.ack_wait_ns) : '-';
}

function remediationHref(diagnostic: ConsumerDiagnostic) {
  if (diagnostic.type !== 'pull') return null;
  const params = new URLSearchParams({
    stream: diagnostic.stream_name,
    consumer: diagnostic.name,
    remediation: diagnostic.num_ack_pending > 0 ? 'ack-pending' : 'pending',
  });
  return `/dashboard/messages?${params.toString()}`;
}

export function ConsumerLagTriage({
  diagnostics,
  streamName,
  maxItems = 6,
  title = 'Consumer Lag Triage',
  description = 'Likely causes and operator actions for the selected stream',
  className,
}: ConsumerLagTriageProps) {
  const sortedDiagnostics = [...diagnostics].sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return (
      b.stream_lag +
      b.num_pending +
      b.num_ack_pending -
      (a.stream_lag + a.num_pending + a.num_ack_pending)
    );
  });
  const visibleDiagnostics = sortedDiagnostics.slice(0, maxItems);
  const issueCount = diagnostics.filter((item) => item.severity !== 'ok').length;

  return (
    <Card className={className}>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              {streamName ? `${description}: ${streamName}` : description}
            </CardDescription>
          </div>
          <Badge variant={issueCount > 0 ? 'warning' : 'success'} className="rounded-md">
            {issueCount} issue{issueCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visibleDiagnostics.length > 0 ? (
          <div className="divide-y">
            {visibleDiagnostics.map((diagnostic) => {
              const cause = likelyCause(diagnostic);
              const CauseIcon = cause.severity === 'ok' ? CheckCircle2 : AlertTriangle;
              const ackPendingHref = buildConsumerMessagesHref({
                streamName: diagnostic.stream_name,
                consumerName: diagnostic.name,
                diagnostic,
                filterSubject: singleConsumerFilterSubject(diagnostic),
                window: 'ack_pending',
              });
              const pendingHref = buildConsumerMessagesHref({
                streamName: diagnostic.stream_name,
                consumerName: diagnostic.name,
                diagnostic,
                filterSubject: singleConsumerFilterSubject(diagnostic),
                window: 'pending',
              });
              const remediateHref = remediationHref(diagnostic);

              return (
                <div
                  key={`${diagnostic.stream_name}:${diagnostic.name}`}
                  className={cn('border-l-4 p-4', rowClass(diagnostic.severity))}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.9fr)_minmax(360px,1.4fr)_minmax(260px,0.9fr)]">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={healthBadgeVariant(diagnostic.severity)}
                          className="rounded-md"
                        >
                          {SEVERITY_LABELS[diagnostic.severity]}
                        </Badge>
                        <Badge variant="outline" className="rounded-md">
                          {diagnostic.type}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/consumers/${encodeURIComponent(diagnostic.stream_name)}/${encodeURIComponent(diagnostic.name)}`}
                          className="break-words font-medium text-primary hover:underline"
                        >
                          {diagnostic.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {diagnostic.stream_name}
                          {consumerFilterSubjects(diagnostic).length > 0
                            ? ` · ${consumerFilterLabel(diagnostic)}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <CauseIcon
                          className={cn(
                            'mt-0.5 h-4 w-4 shrink-0',
                            cause.severity === 'critical' && 'text-destructive',
                            cause.severity === 'warning' && 'text-warning',
                            cause.severity === 'ok' && 'text-success',
                          )}
                        />
                        <div>
                          <p className="font-medium">{cause.label}</p>
                          <p className="text-sm text-muted-foreground">{cause.detail}</p>
                        </div>
                      </div>
                      {diagnostic.issues[0] && (
                        <p className="text-sm text-muted-foreground">
                          {diagnostic.issues[0].recommendation}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <Metric label="Lag" value={diagnostic.stream_lag} icon={Gauge} />
                        <Metric
                          label="Pending"
                          value={diagnostic.num_pending}
                          icon={MessageSquare}
                        />
                        <Metric label="Ack" value={diagnostic.num_ack_pending} icon={Clock} />
                        <Metric label="Waiting" value={diagnostic.num_waiting} icon={Users} />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>ack wait {ackWaitLabel(diagnostic)}</span>
                        <span>max ack {diagnostic.max_ack_pending ?? '-'}</span>
                        <span>deliver {diagnostic.deliver_policy}</span>
                        <span>ack {diagnostic.ack_policy}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap content-start gap-2 xl:justify-end">
                      {ackPendingHref && (
                        <Link href={ackPendingHref}>
                          <Button variant="outline" size="sm">
                            <MessageSquare className="h-4 w-4" />
                            Ack pending
                          </Button>
                        </Link>
                      )}
                      {pendingHref && (
                        <Link href={pendingHref}>
                          <Button variant="outline" size="sm">
                            <MessageSquare className="h-4 w-4" />
                            Pending
                          </Button>
                        </Link>
                      )}
                      {remediateHref && (
                        <Link href={remediateHref}>
                          <Button variant="outline" size="sm">
                            <RotateCcw className="h-4 w-4" />
                            Remediate
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No consumer diagnostics are available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Gauge;
}) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-semibold tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}
