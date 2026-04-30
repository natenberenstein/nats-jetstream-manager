'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useConsumer, useConsumerMetric, useUpdateConsumer } from '@/hooks/useConsumers';
import { consumerUpdateSchema, ConsumerUpdateFormData } from '@/lib/schemas';
import { formatNumber } from '@/lib/utils';
import { ArrowLeft, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ConsumerInfo } from '@/lib/types';

function formatNsToSeconds(nanoseconds?: number): string {
  if (!nanoseconds || Number.isNaN(nanoseconds)) return '-';
  return `${(nanoseconds / 1_000_000_000).toFixed(1)}s`;
}

export default function ConsumerDetailPage({
  params,
}: {
  params: Promise<{ stream: string; name: string }>;
}) {
  const { stream, name } = use(params);
  const streamName = decodeURIComponent(stream);
  const consumerName = decodeURIComponent(name);
  const { connectionId } = useConnection();
  const {
    data: consumer,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useConsumer(connectionId, streamName, consumerName);
  const { data: metricsData } = useConsumerMetric(connectionId, streamName, consumerName);
  const [editing, setEditing] = useState(false);

  const chartData = useMemo(() => {
    if (!metricsData?.points?.length) return [];
    return metricsData.points.map((point) => ({
      time: new Date(point.collected_at).toLocaleTimeString(),
      pending: point.num_pending,
      ack_pending: point.num_ack_pending,
      waiting: point.num_waiting,
    }));
  }, [metricsData]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!consumer) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Consumer &ldquo;{consumerName}&rdquo; not found on stream &ldquo;{streamName}&rdquo;.
      </div>
    );
  }

  const config = consumer.config;
  const isPush = !!config.deliver_subject;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={consumer.name}
        description={config.description}
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <Link href={`/dashboard/consumers?stream=${encodeURIComponent(streamName)}`}>
              <Button variant="outline" size="icon" aria-label="Back to consumers">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Link href={`/dashboard/streams/${encodeURIComponent(streamName)}`}>
              <Button variant="outline">
                <Layers className="w-4 h-4" />
                View Stream
              </Button>
            </Link>
          </>
        }
      />

      {connectionId && (
        <ConsumerEditDialog
          open={editing}
          onOpenChange={setEditing}
          consumer={consumer}
          connectionId={connectionId}
          streamName={streamName}
          onSuccess={() => {
            refetch();
            setEditing(false);
          }}
        />
      )}

      {/* State Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-semibold">{formatNumber(consumer.num_pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ack Pending</p>
            <p className="text-xl font-semibold">{formatNumber(consumer.num_ack_pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Waiting</p>
            <p className="text-xl font-semibold">{formatNumber(consumer.num_waiting)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Delivered Seq</p>
            <p className="text-xl font-semibold">{formatNumber(consumer.delivered.stream_seq)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ack Floor Seq</p>
            <p className="text-xl font-semibold">{formatNumber(consumer.ack_floor.stream_seq)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Consumer Lag Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="pending"
                    name="Pending"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="ack_pending"
                    name="Ack Pending"
                    stroke="#ef4444"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="waiting"
                    name="Waiting"
                    stroke="#10b981"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Delivery Progress</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Consumer Seq</TableHead>
                <TableHead>Stream Seq</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Delivered</TableCell>
                <TableCell>{formatNumber(consumer.delivered.consumer_seq)}</TableCell>
                <TableCell>{formatNumber(consumer.delivered.stream_seq)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Ack Floor</TableCell>
                <TableCell>{formatNumber(consumer.ack_floor.consumer_seq)}</TableCell>
                <TableCell>{formatNumber(consumer.ack_floor.stream_seq)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium w-48">Stream</TableCell>
                <TableCell>
                  <Link
                    href={`/dashboard/streams/${encodeURIComponent(streamName)}`}
                    className="text-primary hover:underline"
                  >
                    {consumer.stream_name}
                  </Link>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Type</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-md">
                    {isPush ? 'Push' : 'Pull'}
                  </Badge>
                </TableCell>
              </TableRow>
              {config.durable_name && (
                <TableRow>
                  <TableCell className="font-medium">Durable Name</TableCell>
                  <TableCell>{config.durable_name}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-medium">Filter Subject</TableCell>
                <TableCell>{config.filter_subject || '*'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Deliver Policy</TableCell>
                <TableCell>{config.deliver_policy || 'all'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Ack Policy</TableCell>
                <TableCell>{config.ack_policy || 'explicit'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Ack Wait</TableCell>
                <TableCell>{formatNsToSeconds(config.ack_wait)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Replay Policy</TableCell>
                <TableCell>{config.replay_policy || 'instant'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Deliver</TableCell>
                <TableCell>
                  {config.max_deliver === -1 ? 'Unlimited' : (config.max_deliver ?? '-')}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Ack Pending</TableCell>
                <TableCell>
                  {config.max_ack_pending === -1
                    ? 'Unlimited'
                    : formatNumber(config.max_ack_pending ?? 0)}
                </TableCell>
              </TableRow>
              {!isPush && (
                <TableRow>
                  <TableCell className="font-medium">Max Waiting</TableCell>
                  <TableCell>{formatNumber(config.max_waiting ?? 0)}</TableCell>
                </TableRow>
              )}
              {isPush && (
                <>
                  <TableRow>
                    <TableCell className="font-medium">Deliver Subject</TableCell>
                    <TableCell>{config.deliver_subject}</TableCell>
                  </TableRow>
                  {config.deliver_group && (
                    <TableRow>
                      <TableCell className="font-medium">Deliver Group</TableCell>
                      <TableCell>{config.deliver_group}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="font-medium">Flow Control</TableCell>
                    <TableCell>{config.flow_control ? 'Enabled' : 'Disabled'}</TableCell>
                  </TableRow>
                  {config.idle_heartbeat != null && config.idle_heartbeat > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">Idle Heartbeat</TableCell>
                      <TableCell>{formatNsToSeconds(config.idle_heartbeat)}</TableCell>
                    </TableRow>
                  )}
                </>
              )}
              {config.rate_limit_bps != null && config.rate_limit_bps > 0 && (
                <TableRow>
                  <TableCell className="font-medium">Rate Limit</TableCell>
                  <TableCell>{formatNumber(config.rate_limit_bps)} bytes/sec</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-medium">Headers Only</TableCell>
                <TableCell>{config.headers_only ? 'Yes' : 'No'}</TableCell>
              </TableRow>
              {config.sample_freq && (
                <TableRow>
                  <TableCell className="font-medium">Sample Frequency</TableCell>
                  <TableCell>{config.sample_freq}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-medium">Created</TableCell>
                <TableCell>{new Date(consumer.created).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ConsumerEditDialog({
  open,
  onOpenChange,
  consumer,
  connectionId,
  streamName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consumer: ConsumerInfo;
  connectionId: string;
  streamName: string;
  onSuccess: () => void;
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
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update consumer');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Consumer: {consumer.name}</DialogTitle>
          <DialogDescription>Modify the mutable configuration for this consumer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Immutable fields */}
          <div className="rounded border border-muted p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Cannot be changed after creation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Name / Durable</Label>
                <Input value={consumer.config.durable_name || consumer.name} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Type</Label>
                <Input value={consumer.config.deliver_subject ? 'Push' : 'Pull'} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Filter Subject</Label>
                <Input value={consumer.config.filter_subject || '*'} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Deliver Policy</Label>
                <Input value={consumer.config.deliver_policy || 'all'} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Ack Policy</Label>
                <Input value={consumer.config.ack_policy || 'explicit'} disabled />
              </div>
              {consumer.config.deliver_subject && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Deliver Subject</Label>
                  <Input value={consumer.config.deliver_subject} disabled />
                </div>
              )}
            </div>
          </div>

          {/* Mutable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="detail-description">Description</Label>
              <Input
                id="detail-description"
                {...register('description')}
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="detail-ack-wait">Ack Wait (seconds)</Label>
              <Input
                id="detail-ack-wait"
                type="number"
                step="0.1"
                min={0}
                {...register('ack_wait_seconds')}
              />
              {errors.ack_wait_seconds && (
                <p className="text-xs text-destructive">{errors.ack_wait_seconds.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="detail-max-deliver">Max Deliver (-1 = unlimited)</Label>
              <Input id="detail-max-deliver" type="number" {...register('max_deliver')} />
              {errors.max_deliver && (
                <p className="text-xs text-destructive">{errors.max_deliver.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="detail-max-ack-pending">Max Ack Pending</Label>
              <Input
                id="detail-max-ack-pending"
                type="number"
                min={0}
                {...register('max_ack_pending')}
              />
              {errors.max_ack_pending && (
                <p className="text-xs text-destructive">{errors.max_ack_pending.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="detail-max-waiting">Max Waiting</Label>
              <Input id="detail-max-waiting" type="number" min={0} {...register('max_waiting')} />
              {errors.max_waiting && (
                <p className="text-xs text-destructive">{errors.max_waiting.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="detail-rate-limit">Rate Limit (bytes/sec, 0 = unlimited)</Label>
              <Input id="detail-rate-limit" type="number" min={0} {...register('rate_limit_bps')} />
              {errors.rate_limit_bps && (
                <p className="text-xs text-destructive">{errors.rate_limit_bps.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="detail-headers-only"
                checked={headersOnly}
                onCheckedChange={(checked) => setValue('headers_only', checked === true)}
              />
              <Label htmlFor="detail-headers-only">Headers Only</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateConsumer.isPending}>
              {updateConsumer.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
