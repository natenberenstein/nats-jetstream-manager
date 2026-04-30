import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  isLoading?: boolean;
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

export function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
  tone = 'default',
  className,
  header,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          {header ?? <p className="text-sm text-muted-foreground">{label}</p>}
          {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className={cn('text-xl font-semibold', TONE_CLASSES[tone])}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
