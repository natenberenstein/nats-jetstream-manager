'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ImpactTone = 'default' | 'info' | 'warning' | 'destructive' | 'success';

export interface ImpactMetric {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: ImpactTone;
}

export interface ImpactRow {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: ImpactTone;
}

interface ImpactPreviewProps {
  title: string;
  description?: ReactNode;
  tone?: ImpactTone;
  metrics?: ImpactMetric[];
  rows?: ImpactRow[];
  notes?: ReactNode[];
  compact?: boolean;
  className?: string;
}

function toneClasses(tone: ImpactTone = 'default') {
  switch (tone) {
    case 'destructive':
      return 'border-destructive/50 bg-destructive/5';
    case 'warning':
      return 'border-warning/50 bg-warning/5';
    case 'success':
      return 'border-success/50 bg-success/5';
    case 'info':
      return 'border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/20';
    default:
      return 'border-border bg-muted/20';
  }
}

function badgeVariant(tone: ImpactTone = 'default') {
  if (tone === 'destructive') return 'destructive';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'success';
  return 'outline';
}

function ToneIcon({ tone }: { tone: ImpactTone }) {
  if (tone === 'destructive') return <ShieldAlert className="h-4 w-4 text-destructive" />;
  if (tone === 'warning') return <AlertTriangle className="h-4 w-4 text-warning" />;
  if (tone === 'success') return <CheckCircle2 className="h-4 w-4 text-success" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

export function ImpactPreview({
  title,
  description,
  tone = 'default',
  metrics = [],
  rows = [],
  notes = [],
  compact = false,
  className,
}: ImpactPreviewProps) {
  return (
    <div className={cn('rounded-md border', toneClasses(tone), compact ? 'p-3' : 'p-4', className)}>
      <div className="flex items-start gap-2">
        <ToneIcon tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium leading-none">{title}</p>
            {tone !== 'default' && (
              <Badge variant={badgeVariant(tone)} className="rounded-md">
                {tone === 'destructive' ? 'high impact' : tone}
              </Badge>
            )}
          </div>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>

      {metrics.length > 0 && (
        <div
          className={cn(
            'grid gap-2',
            compact ? 'mt-3 grid-cols-2 md:grid-cols-4' : 'mt-4 grid-cols-1 sm:grid-cols-2',
          )}
        >
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className={cn('rounded-md border bg-background p-2')}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{metric.label}</span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold">{metric.value}</div>
                {metric.detail && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {metric.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-3 divide-y rounded-md border bg-background">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 break-words font-medium">{row.value}</span>
                  {row.tone && row.tone !== 'default' && (
                    <Badge variant={badgeVariant(row.tone)} className="rounded-md">
                      {row.tone}
                    </Badge>
                  )}
                </div>
                {row.detail && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{row.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      )}
    </div>
  );
}
