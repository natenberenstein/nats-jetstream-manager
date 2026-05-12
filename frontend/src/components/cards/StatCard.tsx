import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatCardMetric =
  | 'default'
  | 'streams'
  | 'messages'
  | 'storage'
  | 'consumers'
  | 'topology'
  | 'pending'
  | 'sequence'
  | 'warning'
  | 'critical'
  | 'success';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  isLoading?: boolean;
  /** Applies the same color-coded visual treatment used by Overview summary cards. */
  metric?: StatCardMetric;
  /** Adds tone-aware styling to the value, e.g. for severity-driven counts. */
  tone?: 'default' | 'destructive' | 'success' | 'warning';
  className?: string;
  /** Render-prop for cases where the badge/header needs custom decoration. */
  header?: React.ReactNode;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: '',
  destructive: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning',
};

const METRIC_CLASSES: Record<StatCardMetric, { badge: string; icon: string }> = {
  default: {
    badge: 'bg-muted text-muted-foreground',
    icon: 'text-muted-foreground',
  },
  streams: {
    badge:
      'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  messages: {
    badge:
      'border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300',
    icon: 'text-green-600 dark:text-green-400',
  },
  storage: {
    badge:
      'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  consumers: {
    badge:
      'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  topology: {
    badge:
      'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  pending: {
    badge:
      'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  sequence: {
    badge:
      'border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  warning: {
    badge: 'border-warning/30 bg-warning/10 text-warning',
    icon: 'text-warning',
  },
  critical: {
    badge: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: 'text-destructive',
  },
  success: {
    badge: 'border-success/30 bg-success/10 text-success',
    icon: 'text-success',
  },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
  metric = 'default',
  tone = 'default',
  className,
  header,
}: StatCardProps) {
  const metricClasses = METRIC_CLASSES[metric];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          {header ?? (
            <Badge variant="outline" className={cn('rounded-md px-2 py-1', metricClasses.badge)}>
              {label}
            </Badge>
          )}
          {Icon && <Icon className={cn('h-6 w-6', metricClasses.icon)} aria-hidden="true" />}
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={cn('text-2xl font-bold', TONE_CLASSES[tone])}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
