'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LastUpdatedProps {
  /** Epoch ms. React Query provides `dataUpdatedAt`. */
  timestamp: number | undefined;
  /** True while a background refetch is in flight — the icon spins. */
  isFetching?: boolean;
  /** Called when the user clicks refresh. */
  onRefresh?: () => void;
  className?: string;
}

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function LastUpdated({ timestamp, isFetching, onRefresh, className }: LastUpdatedProps) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = timestamp ? `Updated ${formatAge(Date.now() - timestamp)}` : 'Never updated';

  return (
    <div
      className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}
      aria-live="polite"
    >
      <span>{label}</span>
      {onRefresh && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          disabled={isFetching}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
}
