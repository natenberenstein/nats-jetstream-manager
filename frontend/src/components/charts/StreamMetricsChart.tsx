'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { StreamMetricPoint } from '@/lib/types';

interface StreamMetricsChartProps {
  points: StreamMetricPoint[];
  title?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(1)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}

export default function StreamMetricsChart({ points, title }: StreamMetricsChartProps) {
  const data = points.map((p) => ({
    ...p,
    time: formatTime(p.collected_at),
  }));

  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No metrics data yet. Waiting for snapshots...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && <h4 className="text-sm font-medium">{title}</h4>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Message Rate Chart */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Message Rate (msg/sec)</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => [`${Number(value).toFixed(2)} msg/s`, 'Message Rate']}
              />
              <Area
                type="monotone"
                dataKey="msg_rate"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Byte Rate Chart */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Byte Throughput</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="time" fontSize={10} />
              <YAxis fontSize={10} tickFormatter={(v) => formatBytes(v).replace('/s', '')} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value) => [formatBytes(Number(value)), 'Byte Rate']}
              />
              <Area
                type="monotone"
                dataKey="byte_rate"
                stroke="hsl(220, 70%, 55%)"
                fill="hsl(220, 70%, 55%)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
