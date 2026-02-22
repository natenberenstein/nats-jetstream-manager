'use client';

import { useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useUptimeSummary, useHealthHistory } from '@/hooks/useHealth';
import HealthTimeline from '@/components/charts/HealthTimeline';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const WINDOWS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export default function HealthPage() {
  const { connectionId } = useConnection();
  const [timeWindow, setTimeWindow] = useState(24);
  const { data: uptime } = useUptimeSummary(connectionId, timeWindow);
  const { data: history } = useHealthHistory(connectionId, timeWindow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Connection Health</h2>
          <p className="text-muted-foreground">
            Uptime tracking and health check history
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <Button
              key={w.hours}
              variant={timeWindow === w.hours ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeWindow(w.hours)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Uptime Summary */}
      {uptime && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Uptime</p>
            <p className={cn(
              'text-3xl font-bold',
              uptime.uptime_pct >= 99 ? 'text-green-600' :
              uptime.uptime_pct >= 95 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {uptime.uptime_pct}%
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Total Checks</p>
            <p className="text-3xl font-bold">{uptime.total_checks}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Up / Down</p>
            <p className="text-3xl font-bold">
              <span className="text-green-600">{uptime.up_checks}</span>
              {' / '}
              <span className="text-red-600">{uptime.down_checks}</span>
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Current Status</p>
            <Badge variant={uptime.last_status === 'up' ? 'default' : 'destructive'} className="mt-1">
              {uptime.last_status?.toUpperCase() || 'UNKNOWN'}
            </Badge>
            {uptime.last_error && (
              <p className="text-xs text-muted-foreground mt-2 truncate">{uptime.last_error}</p>
            )}
          </Card>
        </div>
      )}

      {/* Timeline */}
      {history && (
        <Card className="p-6">
          <HealthTimeline checks={history.checks} />
        </Card>
      )}

      {/* Recent Events Table */}
      {history && history.checks.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
          <div className="overflow-auto max-h-80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">JetStream</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {[...history.checks].reverse().slice(0, 50).map((check, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(check.checked_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={check.status === 'up' ? 'default' : 'destructive'} className="text-xs">
                        {check.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">
                      {check.jetstream_ok ? (
                        <span className="text-green-600">OK</span>
                      ) : (
                        <span className="text-yellow-600">Degraded</span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground truncate max-w-xs">
                      {check.error || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
