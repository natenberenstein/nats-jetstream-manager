'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
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

const msgRateConfig = {
  msg_rate: {
    label: 'Message Rate',
    theme: {
      light: 'hsl(221.2 83.2% 53.3%)',
      dark: 'hsl(217.2 91.2% 59.8%)',
    },
  },
} satisfies ChartConfig;

const byteRateConfig = {
  byte_rate: {
    label: 'Byte Rate',
    theme: {
      light: 'hsl(142 71% 36%)',
      dark: 'hsl(142 64% 45%)',
    },
  },
} satisfies ChartConfig;

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
        <div>
          <p className="text-xs text-muted-foreground mb-2">Message Rate (msg/sec)</p>
          <ChartContainer config={msgRateConfig} className="aspect-auto h-[200px] w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value) => `${Number(value).toFixed(2)} msg/s`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="msg_rate"
                stroke="var(--color-msg_rate)"
                fill="var(--color-msg_rate)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Byte Throughput</p>
          <ChartContainer config={byteRateConfig} className="aspect-auto h-[200px] w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tickFormatter={(v) => formatBytes(v).replace('/s', '')}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value) => formatBytes(Number(value))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="byte_rate"
                stroke="var(--color-byte_rate)"
                fill="var(--color-byte_rate)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
