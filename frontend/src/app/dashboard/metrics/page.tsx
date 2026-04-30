'use client';

import { useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAllStreamMetrics } from '@/hooks/useMetrics';
import StreamMetricsChart from '@/components/charts/StreamMetricsChart';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

const WINDOWS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
];

export default function MetricsPage() {
  const { connectionId } = useConnection();
  const [timeWindow, setTimeWindow] = useState(15);
  const { data, isLoading } = useAllStreamMetrics(connectionId, timeWindow);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Stream Metrics"
        description="Real-time message rates and byte throughput"
        actions={
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w.minutes}
                variant={timeWindow === w.minutes ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeWindow(w.minutes)}
              >
                {w.label}
              </Button>
            ))}
          </div>
        }
      />

      {isLoading && (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-48 w-full" />
        </Card>
      )}

      {data && data.streams.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            No metrics data available yet. The background collector gathers snapshots every 30
            seconds.
          </p>
        </Card>
      )}

      {data &&
        data.streams.map((stream) => (
          <Card key={stream.stream_name} className="p-6">
            <h3 className="text-lg font-semibold mb-4">{stream.stream_name}</h3>
            <StreamMetricsChart points={stream.points} />
          </Card>
        ))}
    </div>
  );
}
