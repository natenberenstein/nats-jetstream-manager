'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useUptimeSummary, useHealthHistory } from '@/hooks/useHealth';
import HealthTimeline from '@/components/charts/HealthTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/cards/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Connection Health"
        description="Uptime tracking and health check history"
        actions={
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
        }
      />

      {/* Uptime Summary */}
      {uptime && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Uptime"
            value={`${uptime.uptime_pct}%`}
            icon={Activity}
            metric={
              uptime.uptime_pct >= 99 ? 'success' : uptime.uptime_pct >= 95 ? 'warning' : 'critical'
            }
            tone={
              uptime.uptime_pct >= 99
                ? 'success'
                : uptime.uptime_pct >= 95
                  ? 'warning'
                  : 'destructive'
            }
          />
          <StatCard
            label="Total Checks"
            value={uptime.total_checks}
            icon={ListChecks}
            metric="topology"
          />
          <StatCard
            label="Up / Down"
            value={
              <>
                <span className="text-success">{uptime.up_checks}</span>
                {' / '}
                <span className="text-destructive">{uptime.down_checks}</span>
              </>
            }
            icon={Activity}
            metric={uptime.down_checks > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Current Status"
            value={
              <div className="space-y-2">
                <Badge variant={uptime.last_status === 'up' ? 'success' : 'destructive'}>
                  {uptime.last_status?.toUpperCase() || 'UNKNOWN'}
                </Badge>
                {uptime.last_error && (
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {uptime.last_error}
                  </p>
                )}
              </div>
            }
            icon={uptime.last_status === 'up' ? CheckCircle2 : AlertTriangle}
            metric={uptime.last_status === 'up' ? 'success' : 'critical'}
          />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Events</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>JetStream</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history.checks]
                    .reverse()
                    .slice(0, 50)
                    .map((check, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(check.checked_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={check.status === 'up' ? 'success' : 'destructive'}
                            className="text-xs"
                          >
                            {check.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {check.jetstream_ok ? (
                            <span className="text-success">OK</span>
                          ) : (
                            <span className="text-warning">Degraded</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {check.error || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
