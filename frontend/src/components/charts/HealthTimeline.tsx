'use client';

import { HealthCheckEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

interface HealthTimelineProps {
  checks: HealthCheckEntry[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HealthTimeline({ checks }: HealthTimelineProps) {
  if (checks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No health check data yet. Waiting for checks...
      </div>
    );
  }

  // Show the last 120 checks max for a reasonable visual width
  const display = checks.slice(-120);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Health Timeline ({display.length} checks)
      </p>
      <div className="flex items-end gap-px h-8">
        {display.map((check, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 min-w-[3px] max-w-[8px] rounded-sm cursor-pointer transition-opacity hover:opacity-80',
              check.status === 'up' ? 'bg-green-500' : 'bg-red-500',
              !check.jetstream_ok && check.status === 'up' && 'bg-yellow-500'
            )}
            style={{ height: '100%' }}
            title={`${formatTime(check.checked_at)} - ${check.status.toUpperCase()}${check.error ? ': ' + check.error : ''}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{display.length > 0 ? formatTime(display[0].checked_at) : ''}</span>
        <span>{display.length > 0 ? formatTime(display[display.length - 1].checked_at) : ''}</span>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Up
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-yellow-500 inline-block" /> JS Degraded
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Down
        </span>
      </div>
    </div>
  );
}
