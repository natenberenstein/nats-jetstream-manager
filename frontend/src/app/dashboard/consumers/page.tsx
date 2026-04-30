'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams } from '@/hooks/useStreams';
import {
  useConsumers,
  useCreateConsumer,
  useDeleteConsumer,
  useUpdateConsumer,
  useConsumerAnalytics,
  useConsumerMetrics,
} from '@/hooks/useConsumers';
import {
  ConsumerAnalytics,
  ConsumerConfig,
  ConsumerInfo,
  ConsumerMetricsResponse,
} from '@/lib/types';
import { consumerUpdateSchema, ConsumerUpdateFormData } from '@/lib/schemas';
import Link from 'next/link';
import { Plus, Trash2, Pencil, Copy } from 'lucide-react';
import { focusFirstError } from '@/lib/form-utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Spinner } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BulkDeleteDialog } from '@/components/ui/bulk-delete-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/cards/StatCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const CHART_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const DEFAULT_VISIBLE_COUNT = 5;

function ConsumerLagChart({ metrics }: { metrics: ConsumerMetricsResponse[] }) {
  const [visibleNames, setVisibleNames] = useState<Set<string>>(() => {
    const top = metrics.slice(0, DEFAULT_VISIBLE_COUNT).map((m) => m.consumer_name);
    return new Set(top);
  });

  const visibleMetrics = useMemo(
    () => metrics.filter((m) => visibleNames.has(m.consumer_name)),
    [metrics, visibleNames],
  );

  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, string | number>>();
    for (const consumer of visibleMetrics) {
      for (const point of consumer.points) {
        const time = new Date(point.collected_at).toLocaleTimeString();
        const existing = timeMap.get(point.collected_at) ?? { time };
        existing[`${consumer.consumer_name}_pending`] = point.num_pending;
        existing[`${consumer.consumer_name}_ack`] = point.num_ack_pending;
        timeMap.set(point.collected_at, existing);
      }
    }
    return Array.from(timeMap.values());
  }, [visibleMetrics]);

  const toggleConsumer = (name: string) => {
    setVisibleNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (metrics.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No metric data yet. Data is collected every 30 seconds.
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {metrics.map((m, i) => {
          const active = visibleNames.has(m.consumer_name);
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <Button
              key={m.consumer_name}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleConsumer(m.consumer_name)}
              className={`h-auto gap-1.5 px-2 py-1 text-xs ${
                active ? 'border-primary/40 bg-primary/10 text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: active ? color : 'transparent',
                  border: `2px solid ${color}`,
                }}
              />
              {m.consumer_name}
            </Button>
          );
        })}
      </div>
      {visibleMetrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Select consumers above to display the chart.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={chartData}>
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {visibleMetrics.map((consumer) => {
              const colorIndex = metrics.findIndex(
                (m) => m.consumer_name === consumer.consumer_name,
              );
              return (
                <Line
                  key={`${consumer.consumer_name}_pending`}
                  type="monotone"
                  dataKey={`${consumer.consumer_name}_pending`}
                  name={`${consumer.consumer_name} pending`}
                  stroke={CHART_COLORS[colorIndex % CHART_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

type SortField = 'name' | 'stream_lag' | 'num_pending' | 'num_ack_pending';
type SortDir = 'asc' | 'desc';

function ConsumerLagAnalyticsView({ analyticsData }: { analyticsData: ConsumerAnalytics | null }) {
  const [sortField, setSortField] = useState<SortField>('stream_lag');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [lagPage, setLagPage] = useState(0);
  const lagPageSize = 10;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setLagPage(0);
  };

  const sortedConsumers = useMemo(() => {
    const items = [...(analyticsData?.consumers || [])];
    items.sort((a, b) => {
      const aVal = sortField === 'name' ? a.name : a[sortField];
      const bVal = sortField === 'name' ? b.name : b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return items;
  }, [analyticsData?.consumers, sortField, sortDir]);

  const lagPageCount = Math.ceil(sortedConsumers.length / lagPageSize);
  const pagedConsumers = sortedConsumers.slice(lagPage * lagPageSize, (lagPage + 1) * lagPageSize);

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <div className="space-y-3">
      {sortedConsumers.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium hover:bg-transparent hover:text-foreground"
                    onClick={() => toggleSort('name')}
                  >
                    Consumer{sortIndicator('name')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium hover:bg-transparent hover:text-foreground"
                    onClick={() => toggleSort('stream_lag')}
                  >
                    Stream Lag{sortIndicator('stream_lag')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium hover:bg-transparent hover:text-foreground"
                    onClick={() => toggleSort('num_pending')}
                  >
                    Pending{sortIndicator('num_pending')}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium hover:bg-transparent hover:text-foreground"
                    onClick={() => toggleSort('num_ack_pending')}
                  >
                    Ack Pending{sortIndicator('num_ack_pending')}
                  </Button>
                </TableHead>
                <TableHead className="w-32">Lag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedConsumers.map((metric) => {
                const width = Math.max(
                  2,
                  Math.round(
                    (metric.stream_lag / Math.max(1, analyticsData?.max_stream_lag || 1)) * 100,
                  ),
                );
                return (
                  <TableRow key={metric.name}>
                    <TableCell className="font-medium text-sm">{metric.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {metric.stream_lag}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {metric.num_pending}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {metric.num_ack_pending}
                    </TableCell>
                    <TableCell>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${width}%` }} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {lagPageCount > 1 && (
            <Pagination
              pageIndex={lagPage}
              pageCount={lagPageCount}
              pageSize={lagPageSize}
              onPageChange={setLagPage}
              onPageSizeChange={() => {}}
              totalItems={sortedConsumers.length}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No analytics data available.</p>
      )}
    </div>
  );
}

const COMPACT_THRESHOLD = 2;

function ConsumerLagSection({
  analyticsData,
  consumerMetrics,
}: {
  analyticsData: ConsumerAnalytics | null;
  consumerMetrics: ConsumerMetricsResponse[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'analytics' | 'chart'>(() => {
    if (typeof window === 'undefined') return 'analytics';
    return (sessionStorage.getItem('consumers:lagTab') as 'analytics' | 'chart') || 'analytics';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('consumers:lagTab', tab);
  }, [tab]);

  const consumerCount = analyticsData?.consumers?.length ?? 0;
  const isCompact = consumerCount > 0 && consumerCount <= COMPACT_THRESHOLD && !expanded;
  const hasChart = consumerMetrics.length > 0;

  if (isCompact) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">Consumer Lag</span>
            <span className="text-muted-foreground">
              Pending:{' '}
              <span className="font-semibold text-foreground">
                {analyticsData?.total_pending ?? 0}
              </span>
            </span>
            <span className="text-muted-foreground">
              Ack Pending:{' '}
              <span className="font-semibold text-foreground">
                {analyticsData?.total_ack_pending ?? 0}
              </span>
            </span>
            <span className="text-muted-foreground">
              Max Lag:{' '}
              <span className="font-semibold text-foreground">
                {analyticsData?.max_stream_lag ?? 0}
              </span>
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
            Expand
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg">Consumer Lag</CardTitle>
        {consumerCount <= COMPACT_THRESHOLD && consumerCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Collapse
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'analytics' | 'chart')}>
          <TabsList>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="chart">Over Time</TabsTrigger>
          </TabsList>
          <TabsContent value="analytics">
            <ConsumerLagAnalyticsView analyticsData={analyticsData} />
          </TabsContent>
          <TabsContent value="chart">
            {hasChart ? (
              <ConsumerLagChart metrics={consumerMetrics} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No metric data yet. Data is collected every 30 seconds.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

const DEFAULT_CONSUMER_FORM: ConsumerConfig = {
  durable_name: '',
  description: '',
  filter_subject: '',
  ack_policy: 'explicit',
  deliver_policy: 'all',
  replay_policy: 'instant',
  ack_wait: 30_000_000_000,
  max_deliver: -1,
  max_ack_pending: 1000,
  max_waiting: 512,
  headers_only: false,
};

function formatNsToSeconds(nanoseconds?: number): string {
  if (!nanoseconds || Number.isNaN(nanoseconds)) {
    return '-';
  }
  return `${(nanoseconds / 1_000_000_000).toFixed(1)}s`;
}

function formatDate(dateValue?: string): string {
  if (!dateValue) {
    return '-';
  }
  return new Date(dateValue).toLocaleString();
}

function ConsumerEditForm({
  consumer,
  connectionId,
  streamName,
  onClose,
}: {
  consumer: ConsumerInfo;
  connectionId: string;
  streamName: string;
  onClose: () => void;
}) {
  const updateConsumer = useUpdateConsumer(connectionId, streamName);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ConsumerUpdateFormData>({
    resolver: zodResolver(consumerUpdateSchema),
    defaultValues: {
      description: consumer.config.description || '',
      ack_wait_seconds: (consumer.config.ack_wait ?? 30_000_000_000) / 1_000_000_000,
      max_deliver: consumer.config.max_deliver ?? -1,
      max_ack_pending: consumer.config.max_ack_pending ?? 1000,
      max_waiting: consumer.config.max_waiting ?? 512,
      rate_limit_bps: consumer.config.rate_limit_bps ?? 0,
      headers_only: consumer.config.headers_only ?? false,
    },
  });

  const headersOnly = watch('headers_only');

  const onSubmit = async (data: ConsumerUpdateFormData) => {
    try {
      await updateConsumer.mutateAsync({
        consumerName: consumer.name,
        config: {
          description: data.description || undefined,
          ack_wait: Math.round(data.ack_wait_seconds * 1_000_000_000),
          max_deliver: data.max_deliver,
          max_ack_pending: data.max_ack_pending,
          max_waiting: data.max_waiting,
          rate_limit_bps: data.rate_limit_bps,
          headers_only: data.headers_only,
        },
      });
      toast.success(`Consumer "${consumer.name}" updated successfully.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update consumer');
    }
  };

  return (
    <TableRow>
      <TableCell colSpan={10}>
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Consumer: {consumer.name}</CardTitle>
            <CardDescription>
              Only mutable fields are editable. Immutable fields are shown as read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit, focusFirstError)} className="space-y-4">
              {/* Immutable fields - read-only */}
              <div className="rounded border border-muted p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Cannot be changed after creation
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Name / Durable</Label>
                    <Input value={consumer.config.durable_name || consumer.name} disabled />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Type</Label>
                    <Input value={consumer.config.deliver_subject ? 'Push' : 'Pull'} disabled />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Filter Subject</Label>
                    <Input value={consumer.config.filter_subject || '*'} disabled />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Deliver Policy</Label>
                    <Input value={consumer.config.deliver_policy || 'all'} disabled />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Ack Policy</Label>
                    <Input value={consumer.config.ack_policy || 'explicit'} disabled />
                  </div>
                  {consumer.config.deliver_subject && (
                    <div>
                      <Label className="text-muted-foreground">Deliver Subject</Label>
                      <Input value={consumer.config.deliver_subject} disabled />
                    </div>
                  )}
                </div>
              </div>

              {/* Mutable fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1 md:col-span-2">
                  <Label>Description</Label>
                  <Input {...register('description')} placeholder="Optional description" />
                </label>

                <label className="space-y-1">
                  <Label>Ack Wait (seconds)</Label>
                  <Input type="number" step="0.1" min={0} {...register('ack_wait_seconds')} />
                  {errors.ack_wait_seconds && (
                    <p className="text-xs text-destructive">{errors.ack_wait_seconds.message}</p>
                  )}
                </label>

                <label className="space-y-1">
                  <Label>Max Deliver (-1 = unlimited)</Label>
                  <Input type="number" {...register('max_deliver')} />
                  {errors.max_deliver && (
                    <p className="text-xs text-destructive">{errors.max_deliver.message}</p>
                  )}
                </label>

                <label className="space-y-1">
                  <Label>Max Ack Pending</Label>
                  <Input type="number" min={0} {...register('max_ack_pending')} />
                  {errors.max_ack_pending && (
                    <p className="text-xs text-destructive">{errors.max_ack_pending.message}</p>
                  )}
                </label>

                <label className="space-y-1">
                  <Label>Max Waiting</Label>
                  <Input type="number" min={0} {...register('max_waiting')} />
                  {errors.max_waiting && (
                    <p className="text-xs text-destructive">{errors.max_waiting.message}</p>
                  )}
                </label>

                <label className="space-y-1">
                  <Label>Rate Limit (bytes/sec, 0 = unlimited)</Label>
                  <Input type="number" min={0} {...register('rate_limit_bps')} />
                  {errors.rate_limit_bps && (
                    <p className="text-xs text-destructive">{errors.rate_limit_bps.message}</p>
                  )}
                </label>

                <div className="flex items-center gap-2 pt-6">
                  <Checkbox
                    id="edit-headers-only"
                    checked={headersOnly}
                    onCheckedChange={(checked) => setValue('headers_only', checked === true)}
                  />
                  <Label htmlFor="edit-headers-only">Headers Only</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateConsumer.isPending}>
                  {updateConsumer.isPending && <Spinner />}
                  {updateConsumer.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TableCell>
    </TableRow>
  );
}

export default function ConsumersPage() {
  const searchParams = useSearchParams();
  const { connectionId } = useConnection();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const streamFromParam = searchParams.get('stream');
  const [selectedStream, setSelectedStream] = useState<string | null>(streamFromParam);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedConsumers, setSelectedConsumers] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<ConsumerConfig>(DEFAULT_CONSUMER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingConsumer, setEditingConsumer] = useState<string | null>(null);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const durableNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedStream && streamNames.length > 0) {
      setSelectedStream(streamNames[0]);
      return;
    }

    if (selectedStream && !streamNames.includes(selectedStream)) {
      setSelectedStream(streamNames[0] || null);
    }
  }, [selectedStream, streamNames]);

  const {
    data: consumersData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useConsumers(connectionId, selectedStream);
  const confirm = useConfirm();
  const [bulkOpen, setBulkOpen] = useState(false);
  const { data: analyticsData } = useConsumerAnalytics(connectionId, selectedStream);
  const { data: consumerMetrics } = useConsumerMetrics(connectionId, selectedStream);
  const createConsumer = useCreateConsumer(connectionId, selectedStream || '');
  const deleteConsumer = useDeleteConsumer(connectionId, selectedStream || '');

  const handleCloneConsumer = (consumer: ConsumerInfo) => {
    setFormData({
      ...consumer.config,
      durable_name: '',
      name: '',
    });
    setShowCreateForm(true);
    setEditingConsumer(null);
    setCloneMessage(
      `Cloned config from "${consumer.name}". Edit the config and create a new consumer. Delete the old one when ready.`,
    );
    // Focus the durable name field after render
    setTimeout(() => {
      durableNameRef.current?.focus();
    }, 100);
  };

  const handleCreateConsumer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!selectedStream) {
      setFormError('Select a stream before creating a consumer.');
      return;
    }

    const durableName = formData.durable_name?.trim();
    const consumerName = formData.name?.trim();
    if (!durableName && !consumerName) {
      setFormError('Provide either a durable name or a consumer name.');
      return;
    }

    if (formData.deliver_subject !== undefined && !formData.deliver_subject.trim()) {
      setFormError('Deliver subject is required for push consumers.');
      return;
    }

    const payload: ConsumerConfig = {
      ...formData,
      name: consumerName || undefined,
      durable_name: durableName || undefined,
      description: formData.description?.trim() || undefined,
      filter_subject: formData.filter_subject?.trim() || undefined,
      deliver_subject: formData.deliver_subject?.trim() || undefined,
      deliver_group: formData.deliver_group?.trim() || undefined,
    };

    try {
      await createConsumer.mutateAsync(payload);
      toast.success(`Consumer created successfully.`);
      setFormData(DEFAULT_CONSUMER_FORM);
      setShowCreateForm(false);
      setCloneMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create consumer';
      setFormError(message);
    }
  };

  const handleDeleteConsumer = async (consumerName: string) => {
    if (!selectedStream) return;
    const ok = await confirm({
      title: 'Delete consumer',
      description: (
        <>
          This permanently deletes consumer{' '}
          <span className="font-mono font-semibold">{consumerName}</span> from stream{' '}
          <span className="font-mono font-semibold">{selectedStream}</span>.
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Delete consumer',
    });
    if (!ok) return;
    try {
      await deleteConsumer.mutateAsync(consumerName);
      toast.success(`Consumer "${consumerName}" deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete consumer');
    }
  };

  const toggleSelectConsumer = (consumerName: string) => {
    setSelectedConsumers((prev) => {
      const next = new Set(prev);
      if (next.has(consumerName)) next.delete(consumerName);
      else next.add(consumerName);
      return next;
    });
  };

  const toggleSelectAllConsumers = () => {
    if (!consumersData?.consumers?.length) return;
    setSelectedConsumers((prev) =>
      prev.size === consumersData.consumers.length
        ? new Set()
        : new Set(consumersData.consumers.map((c) => c.name)),
    );
  };

  const handleBulkDeleteConsumers = () => {
    if (!selectedStream || selectedConsumers.size === 0) return;
    setBulkOpen(true);
  };

  const filteredConsumers = useMemo(() => {
    const items = consumersData?.consumers ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.config.durable_name && c.config.durable_name.toLowerCase().includes(q)) ||
        (c.config.filter_subject && c.config.filter_subject.toLowerCase().includes(q)),
    );
  }, [consumersData?.consumers, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const healthSummary = useMemo(() => {
    const consumers = consumersData?.consumers || [];
    const total = consumers.length;
    const totalPending = consumers.reduce((sum, c) => sum + c.num_pending, 0);
    const totalAckPending = consumers.reduce((sum, c) => sum + c.num_ack_pending, 0);
    const stalled = consumers.filter((c) => c.num_ack_pending > 100 || c.num_pending > 1000).length;
    return { total, totalPending, totalAckPending, stalled };
  }, [consumersData?.consumers]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Consumers"
        description="Manage JetStream consumers by stream"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <Input
              placeholder="Filter consumers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56"
              disabled={!selectedStream}
            />
            <Select
              value={selectedStream || ''}
              onValueChange={(value) => {
                setSelectedStream(value || null);
                setPageIndex(0);
              }}
              disabled={streamNames.length === 0}
            >
              <SelectTrigger className="w-56">
                <SelectValue
                  placeholder={
                    streamNames.length === 0 ? 'No streams available' : 'Select a stream'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {streamNames.map((streamName) => (
                  <SelectItem key={streamName} value={streamName}>
                    {streamName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setShowCreateForm(true)} disabled={!selectedStream}>
              <Plus className="w-4 h-4" />
              Create Consumer
            </Button>
          </>
        }
      />

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Delete selected consumers"
        description={
          <>
            From stream <span className="font-mono font-semibold">{selectedStream}</span>. This
            cannot be undone.
          </>
        }
        items={Array.from(selectedConsumers)}
        onDeleteItem={(name) => deleteConsumer.mutateAsync(name).then(() => undefined)}
        onFinished={({ succeeded, failed }) => {
          if (succeeded)
            toast.success(`Deleted ${succeeded} consumer${succeeded === 1 ? '' : 's'}.`);
          if (failed.length) toast.error(`${failed.length} failed: ${failed.join(', ')}`);
          setSelectedConsumers(new Set());
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Consumers" value={healthSummary.total} isLoading={isLoading} />
        <StatCard label="Pending" value={healthSummary.totalPending} isLoading={isLoading} />
        <StatCard label="Ack Pending" value={healthSummary.totalAckPending} isLoading={isLoading} />
        <StatCard
          label="Potentially Stalled"
          value={healthSummary.stalled}
          isLoading={isLoading}
          tone={healthSummary.stalled > 0 ? 'destructive' : 'default'}
        />
      </div>

      <ConsumerLagSection
        analyticsData={analyticsData ?? null}
        consumerMetrics={consumerMetrics ?? []}
      />

      <Dialog
        open={showCreateForm}
        onOpenChange={(open) => {
          setShowCreateForm(open);
          if (!open) {
            setCloneMessage(null);
            setFormData(DEFAULT_CONSUMER_FORM);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Consumer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateConsumer} className="space-y-4">
            {cloneMessage && (
              <Alert>
                <AlertDescription>{cloneMessage}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <Label htmlFor="consumer-type">Consumer Type</Label>
              <Select
                value={formData.deliver_subject !== undefined ? 'push' : 'pull'}
                onValueChange={(value) => {
                  if (value === 'pull') {
                    setFormData((prev) => ({
                      ...prev,
                      deliver_subject: undefined,
                      deliver_group: undefined,
                      flow_control: undefined,
                      idle_heartbeat: undefined,
                    }));
                  } else {
                    setFormData((prev) => ({
                      ...prev,
                      deliver_subject: '',
                      max_waiting: undefined,
                    }));
                  }
                }}
              >
                <SelectTrigger id="consumer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pull">Pull</SelectItem>
                  <SelectItem value="push">Push</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {formData.deliver_subject !== undefined
                  ? 'Push: server delivers messages to a subject'
                  : 'Pull: clients request messages on demand'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="durable-name">Durable Name</Label>
                <Input
                  id="durable-name"
                  ref={durableNameRef}
                  type="text"
                  value={formData.durable_name || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, durable_name: event.target.value }))
                  }
                  placeholder="order-worker"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="consumer-name">Consumer Name (optional)</Label>
                <Input
                  id="consumer-name"
                  type="text"
                  value={formData.name || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="consumer-name"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="filter-subject">Filter Subject</Label>
                <Input
                  id="filter-subject"
                  type="text"
                  value={formData.filter_subject || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, filter_subject: event.target.value }))
                  }
                  placeholder="orders.created"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="consumer-description">Description</Label>
                <Input
                  id="consumer-description"
                  type="text"
                  value={formData.description || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Processes order events"
                />
              </div>

              {formData.deliver_subject !== undefined && (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="deliver-subject">Deliver Subject</Label>
                    <Input
                      id="deliver-subject"
                      type="text"
                      value={formData.deliver_subject || ''}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          deliver_subject: event.target.value,
                        }))
                      }
                      placeholder="deliver.orders"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="deliver-group">Deliver Group (optional)</Label>
                    <Input
                      id="deliver-group"
                      type="text"
                      value={formData.deliver_group || ''}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          deliver_group: event.target.value,
                        }))
                      }
                      placeholder="worker-group"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="idle-heartbeat">Idle Heartbeat (nanoseconds, 0 = off)</Label>
                    <Input
                      id="idle-heartbeat"
                      type="number"
                      min={0}
                      value={formData.idle_heartbeat ?? 0}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          idle_heartbeat: Number(event.target.value),
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id="flow-control"
                      checked={formData.flow_control ?? false}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, flow_control: checked === true }))
                      }
                    />
                    <Label htmlFor="flow-control">Flow Control</Label>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <Label htmlFor="ack-policy">Ack Policy</Label>
                <Select
                  value={formData.ack_policy}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      ack_policy: value as ConsumerConfig['ack_policy'],
                    }))
                  }
                >
                  <SelectTrigger id="ack-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="explicit">explicit</SelectItem>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="deliver-policy">Deliver Policy</Label>
                <Select
                  value={formData.deliver_policy}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      deliver_policy: value as ConsumerConfig['deliver_policy'],
                    }))
                  }
                >
                  <SelectTrigger id="deliver-policy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="last">last</SelectItem>
                    <SelectItem value="new">new</SelectItem>
                    <SelectItem value="by_start_sequence">by_start_sequence</SelectItem>
                    <SelectItem value="by_start_time">by_start_time</SelectItem>
                    <SelectItem value="last_per_subject">last_per_subject</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="ack-wait-ns">Ack Wait (nanoseconds)</Label>
                <Input
                  id="ack-wait-ns"
                  type="number"
                  min={1}
                  value={formData.ack_wait ?? 30_000_000_000}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, ack_wait: Number(event.target.value) }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max-deliver">Max Deliver</Label>
                <Input
                  id="max-deliver"
                  type="number"
                  value={formData.max_deliver ?? -1}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, max_deliver: Number(event.target.value) }))
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max-ack-pending">Max Ack Pending</Label>
                <Input
                  id="max-ack-pending"
                  type="number"
                  min={0}
                  value={formData.max_ack_pending ?? 1000}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      max_ack_pending: Number(event.target.value),
                    }))
                  }
                />
              </div>

              {formData.deliver_subject === undefined && (
                <div className="space-y-1">
                  <Label htmlFor="max-waiting">Max Waiting</Label>
                  <Input
                    id="max-waiting"
                    type="number"
                    min={0}
                    value={formData.max_waiting ?? 512}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        max_waiting: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="rate-limit">Rate Limit (bytes/sec)</Label>
                <Input
                  id="rate-limit"
                  type="number"
                  min={0}
                  value={formData.rate_limit_bps ?? 0}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      rate_limit_bps: Number(event.target.value),
                    }))
                  }
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="headers-only"
                  checked={formData.headers_only ?? false}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, headers_only: checked === true }))
                  }
                />
                <Label htmlFor="headers-only">Headers Only</Label>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setCloneMessage(null);
                  setFormData(DEFAULT_CONSUMER_FORM);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createConsumer.isPending}>
                {createConsumer.isPending && <Spinner />}
                {createConsumer.isPending ? 'Creating…' : 'Create Consumer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedConsumers.size > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/50 px-4 py-2">
          <p className="text-sm">
            <span className="font-medium">{selectedConsumers.size}</span> selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedConsumers(new Set())}>
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDeleteConsumers}
              disabled={deleteConsumer.isPending}
            >
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <Card>
        {!selectedStream ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Create a stream first to manage consumers.
          </CardContent>
        ) : isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={6} columns={8} />
          </CardContent>
        ) : filteredConsumers.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        !!filteredConsumers.length &&
                        selectedConsumers.size === filteredConsumers.length
                      }
                      onCheckedChange={toggleSelectAllConsumers}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Durable</TableHead>
                  <TableHead>Filter</TableHead>
                  <TableHead>Ack Policy</TableHead>
                  <TableHead>Ack Wait</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConsumers
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((consumer) => (
                    <>
                      <TableRow key={consumer.name}>
                        <TableCell>
                          <Checkbox
                            checked={selectedConsumers.has(consumer.name)}
                            onCheckedChange={() => toggleSelectConsumer(consumer.name)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/dashboard/consumers/${encodeURIComponent(selectedStream!)}/${encodeURIComponent(consumer.name)}`}
                            className="text-primary hover:underline"
                          >
                            {consumer.name}
                          </Link>
                        </TableCell>
                        <TableCell>{consumer.config.durable_name || '-'}</TableCell>
                        <TableCell>{consumer.config.filter_subject || '*'}</TableCell>
                        <TableCell>{consumer.config.ack_policy || '-'}</TableCell>
                        <TableCell>{formatNsToSeconds(consumer.config.ack_wait)}</TableCell>
                        <TableCell>{consumer.num_pending}</TableCell>
                        <TableCell>{consumer.num_waiting}</TableCell>
                        <TableCell>{formatDate(consumer.created)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            onClick={() =>
                              setEditingConsumer(
                                editingConsumer === consumer.name ? null : consumer.name,
                              )
                            }
                            variant="ghost"
                            size="icon"
                            title="Edit consumer"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleCloneConsumer(consumer)}
                            variant="ghost"
                            size="icon"
                            title="Clone consumer config"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteConsumer(consumer.name)}
                            disabled={deleteConsumer.isPending}
                            variant="ghost"
                            size="icon"
                            title="Delete consumer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {editingConsumer === consumer.name && connectionId && selectedStream && (
                        <ConsumerEditForm
                          key={`edit-${consumer.name}`}
                          consumer={consumer}
                          connectionId={connectionId}
                          streamName={selectedStream}
                          onClose={() => setEditingConsumer(null)}
                        />
                      )}
                    </>
                  ))}
              </TableBody>
            </Table>
            <Pagination
              pageIndex={pageIndex}
              pageCount={Math.ceil(filteredConsumers.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={filteredConsumers.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              No consumers found for stream &ldquo;{selectedStream}&rdquo;
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              Create First Consumer
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
