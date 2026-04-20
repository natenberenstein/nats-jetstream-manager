import { cn } from '@/lib/utils';

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 6, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full space-y-2 p-4" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton key={colIdx} className={cn('h-4 flex-1', colIdx === 0 && 'max-w-[12rem]')} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-8 w-24" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
