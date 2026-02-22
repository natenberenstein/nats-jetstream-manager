'use client';

import { useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useAllStreamMetrics } from '@/hooks/useMetrics';
import StreamMetricsChart from '@/components/charts/StreamMetricsChart';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Stream Metrics</h2>
          <p className="text-muted-foreground">
            Real-time message rates and byte throughput
          </p>
        </div>
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
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading metrics...</p>
      )}

      {data && data.streams.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            No metrics data available yet. The background collector gathers snapshots every 30 seconds.
          </p>
        </Card>
      )}

      {data && data.streams.map((stream) => (
        <Card key={stream.stream_name} className="p-6">
          <h3 className="text-lg font-semibold mb-4">{stream.stream_name}</h3>
          <StreamMetricsChart points={stream.points} />
        </Card>
      ))}
    </div>
  );
}
