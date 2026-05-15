'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  HardDrive,
  Info,
  Network,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { StreamConfig, StreamState } from '@/lib/types';
import { cn, formatBytes, formatNumber } from '@/lib/utils';

type AdvisorySeverity = 'critical' | 'warning' | 'info' | 'success';

interface StreamConfigAdvisorProps {
  config: Partial<StreamConfig>;
  state?: Partial<StreamState>;
  consumerCount?: number;
  clusterNodeCount?: number;
  clusterTopology?: 'standalone' | 'clustered';
  className?: string;
}

interface Advisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
}

function limitRatio(used?: number, limit?: number) {
  if (used === undefined || limit === undefined || limit <= 0) return null;
  return used / limit;
}

function severityRank(severity: AdvisorySeverity) {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  if (severity === 'info') return 1;
  return 0;
}

function iconForSeverity(severity: AdvisorySeverity) {
  if (severity === 'critical' || severity === 'warning') return AlertTriangle;
  if (severity === 'success') return CheckCircle2;
  return Info;
}

function badgeVariant(severity: AdvisorySeverity) {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'outline';
}

function advisoryBorder(severity: AdvisorySeverity) {
  if (severity === 'critical') return 'border-l-destructive bg-destructive/5';
  if (severity === 'warning') return 'border-l-warning bg-warning/5';
  if (severity === 'success') return 'border-l-success bg-success/5';
  return 'border-l-blue-400 bg-blue-50/60 dark:bg-blue-950/20';
}

function buildAdvisories({
  config,
  state,
  consumerCount,
  clusterNodeCount,
  clusterTopology,
}: StreamConfigAdvisorProps): Advisory[] {
  const advisories: Advisory[] = [];
  const subjects = config.subjects ?? [];
  const retention = config.retention ?? 'limits';
  const storage = config.storage ?? 'file';
  const discard = config.discard ?? 'old';
  const replicas = Number(config.replicas ?? 1);
  const maxMsgs = Number(config.max_msgs ?? -1);
  const maxBytes = Number(config.max_bytes ?? -1);
  const maxAge = Number(config.max_age ?? 0);
  const messageCount = state?.messages ?? 0;
  const byteCount = state?.bytes ?? 0;
  const consumers = consumerCount ?? state?.consumer_count ?? 0;
  const hasFiniteCountLimit = maxMsgs > 0;
  const hasFiniteByteLimit = maxBytes > 0;
  const hasFiniteAgeLimit = maxAge > 0;

  if (subjects.length === 0) {
    advisories.push({
      id: 'subjects-empty',
      severity: 'critical',
      title: 'No subjects configured',
      detail: 'The stream will not capture messages until at least one subject is added.',
    });
  }

  if (subjects.includes('>')) {
    advisories.push({
      id: 'subjects-catch-all',
      severity: 'warning',
      title: 'Catch-all subject',
      detail:
        'A global wildcard can capture unexpected traffic and make later routing changes risky.',
    });
  }

  if (retention === 'workqueue' && consumers === 0) {
    advisories.push({
      id: 'workqueue-no-consumers',
      severity: messageCount > 0 ? 'warning' : 'info',
      title: 'Work queue has no consumers',
      detail:
        messageCount > 0
          ? 'Stored work has no active consumer path.'
          : 'Create the worker consumer before publishing production work.',
    });
  }

  if (retention === 'workqueue' && subjects.length > 1) {
    advisories.push({
      id: 'workqueue-multiple-subjects',
      severity: 'info',
      title: 'Work queue ownership',
      detail: 'Keep consumer filters non-overlapping so each message has one clear owner.',
    });
  }

  if (retention === 'interest' && consumers === 0) {
    advisories.push({
      id: 'interest-no-consumers',
      severity: 'warning',
      title: 'Interest retention without consumers',
      detail:
        'Messages published before matching consumers exist may not be retained for later readers.',
    });
  }

  if (storage === 'memory' && !hasFiniteByteLimit && !hasFiniteCountLimit && !hasFiniteAgeLimit) {
    advisories.push({
      id: 'memory-unbounded',
      severity: 'critical',
      title: 'Unbounded memory storage',
      detail: 'Add a max bytes, max messages, or max age limit before using this stream heavily.',
    });
  }

  if (discard === 'new' && (hasFiniteByteLimit || hasFiniteCountLimit)) {
    advisories.push({
      id: 'discard-new',
      severity: 'warning',
      title: 'Publishers can be rejected at the limit',
      detail:
        'Discard new keeps old messages and rejects new writes once count or byte limits are hit.',
    });
  }

  const byteRatio = limitRatio(byteCount, maxBytes);
  if (byteRatio !== null && byteRatio >= 0.75) {
    advisories.push({
      id: 'bytes-near-limit',
      severity: byteRatio >= 0.9 ? 'critical' : 'warning',
      title: `${Math.round(byteRatio * 100)}% of max bytes used`,
      detail: `${formatBytes(byteCount)} stored of ${formatBytes(maxBytes)}.`,
    });
  }

  const messageRatio = limitRatio(messageCount, maxMsgs);
  if (messageRatio !== null && messageRatio >= 0.75) {
    advisories.push({
      id: 'messages-near-limit',
      severity: messageRatio >= 0.9 ? 'critical' : 'warning',
      title: `${Math.round(messageRatio * 100)}% of max messages used`,
      detail: `${formatNumber(messageCount)} stored of ${formatNumber(maxMsgs)}.`,
    });
  }

  if (hasFiniteAgeLimit && maxAge < 300 && retention !== 'workqueue') {
    advisories.push({
      id: 'short-max-age',
      severity: 'warning',
      title: 'Short retention horizon',
      detail: 'Messages may expire before slow or offline consumers can inspect them.',
    });
  }

  if (clusterTopology === 'standalone' && replicas > 1) {
    advisories.push({
      id: 'standalone-replicas',
      severity: 'critical',
      title: 'Replica count exceeds standalone topology',
      detail: 'A standalone server cannot satisfy replicated stream placement.',
    });
  } else if (
    clusterNodeCount !== undefined &&
    clusterNodeCount > 0 &&
    replicas > clusterNodeCount
  ) {
    advisories.push({
      id: 'replicas-exceed-nodes',
      severity: 'critical',
      title: 'Replica count exceeds discovered nodes',
      detail: `${replicas} replicas requested across ${clusterNodeCount} discovered node${clusterNodeCount === 1 ? '' : 's'}.`,
    });
  } else if ((clusterNodeCount ?? 0) > 1 && replicas === 1) {
    advisories.push({
      id: 'single-replica-cluster',
      severity: 'info',
      title: 'Single replica on a cluster',
      detail: 'The stream will not tolerate a server loss unless replicas are increased.',
    });
  }

  if (replicas > 1 && replicas % 2 === 0) {
    advisories.push({
      id: 'even-replicas',
      severity: 'info',
      title: 'Even replica count',
      detail:
        'Even replica counts usually add cost without improving failure tolerance over the previous odd count.',
    });
  }

  if (config.no_ack) {
    advisories.push({
      id: 'no-ack',
      severity: 'warning',
      title: 'Publish acknowledgements disabled',
      detail:
        'Publishers will lose the normal JetStream acknowledgement signal for stored messages.',
    });
  }

  if (advisories.length === 0) {
    advisories.push({
      id: 'config-ok',
      severity: 'success',
      title: 'Configuration looks balanced',
      detail: 'No high-risk retention, storage, or replica combinations detected.',
    });
  }

  return advisories.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function StreamConfigAdvisor(props: StreamConfigAdvisorProps) {
  const advisories = buildAdvisories(props);
  const highest = advisories[0]?.severity ?? 'success';
  const Icon = iconForSeverity(highest);
  const subjectCount = props.config.subjects?.length ?? 0;
  const replicaCount = props.config.replicas ?? 1;

  return (
    <div className={cn('rounded-md border bg-background', props.className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn(
              'h-4 w-4',
              highest === 'critical' && 'text-destructive',
              highest === 'warning' && 'text-warning',
              highest === 'success' && 'text-success',
              highest === 'info' && 'text-muted-foreground',
            )}
          />
          <span className="font-medium">Configuration advisor</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 rounded-md">
            <GitBranch className="h-3 w-3" />
            {subjectCount} subject{subjectCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline" className="gap-1 rounded-md">
            {props.config.storage === 'memory' ? (
              <Database className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            {props.config.storage ?? 'file'}
          </Badge>
          <Badge variant="outline" className="gap-1 rounded-md">
            <Network className="h-3 w-3" />
            {replicaCount} replica{replicaCount === 1 ? '' : 's'}
          </Badge>
        </div>
      </div>
      <div className="divide-y">
        {advisories.map((advisory) => {
          const AdvisoryIcon = iconForSeverity(advisory.severity);
          return (
            <div
              key={advisory.id}
              className={cn('border-l-4 px-3 py-2.5', advisoryBorder(advisory.severity))}
            >
              <div className="flex flex-wrap items-center gap-2">
                <AdvisoryIcon className="h-4 w-4 shrink-0" />
                <p className="font-medium">{advisory.title}</p>
                <Badge variant={badgeVariant(advisory.severity)} className="rounded-md">
                  {advisory.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{advisory.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
