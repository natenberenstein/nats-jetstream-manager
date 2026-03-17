'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
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
} from '@/hooks/useConsumers';
import { ConsumerConfig, ConsumerInfo } from '@/lib/types';
import { consumerUpdateSchema, ConsumerUpdateFormData } from '@/lib/schemas';
import { Plus, RefreshCw, Trash2, X, Pencil, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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
import { Pagination } from '@/components/ui/pagination';

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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

                <label className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={headersOnly}
                    onChange={(e) =>
                      setValue('headers_only', (e.target as HTMLInputElement).checked)
                    }
                  />
                  <Label>Headers Only</Label>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateConsumer.isPending}>
                  {updateConsumer.isPending ? 'Saving...' : 'Save Changes'}
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
  const { connectionId } = useConnection();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedConsumers, setSelectedConsumers] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<ConsumerConfig>(DEFAULT_CONSUMER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingConsumer, setEditingConsumer] = useState<string | null>(null);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
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

  const { data: consumersData, isLoading, refetch } = useConsumers(connectionId, selectedStream);
  const { data: analyticsData } = useConsumerAnalytics(connectionId, selectedStream);
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

    const payload: ConsumerConfig = {
      ...formData,
      name: consumerName || undefined,
      durable_name: durableName || undefined,
      description: formData.description?.trim() || undefined,
      filter_subject: formData.filter_subject?.trim() || undefined,
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
    if (!selectedStream) {
      return;
    }

    const confirmed = window.confirm(
      `Delete consumer "${consumerName}" from stream "${selectedStream}"?`,
    );
    if (!confirmed) {
      return;
    }

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

  const handleBulkDeleteConsumers = async () => {
    if (!selectedStream || selectedConsumers.size === 0) return;
    const names = Array.from(selectedConsumers);
    const confirmed = window.confirm(
      `Dry run preview:\n${names.slice(0, 10).join('\n')}\n\nDelete ${names.length} consumers from ${selectedStream}?`,
    );
    if (!confirmed) return;
    const guard = window.prompt('Type DELETE to confirm bulk consumer deletion:');
    if (guard !== 'DELETE') return;
    for (const name of names) {
      try {
        await deleteConsumer.mutateAsync(name);
      } catch (error) {
        console.error('Bulk delete failed for consumer', name, error);
      }
    }
    setSelectedConsumers(new Set());
  };

  const healthSummary = useMemo(() => {
    const consumers = consumersData?.consumers || [];
    const total = consumers.length;
    const totalPending = consumers.reduce((sum, c) => sum + c.num_pending, 0);
    const totalAckPending = consumers.reduce((sum, c) => sum + c.num_ack_pending, 0);
    const stalled = consumers.filter((c) => c.num_ack_pending > 100 || c.num_pending > 1000).length;
    return { total, totalPending, totalAckPending, stalled };
  }, [consumersData?.consumers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2">Consumers</h1>
          <p className="text-muted-foreground">Manage JetStream consumers by stream</p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={selectedStream || ''}
            onChange={(event) => {
              setSelectedStream(event.target.value || null);
              setPageIndex(0);
            }}
            disabled={streamNames.length === 0}
          >
            {streamNames.length === 0 ? (
              <option value="">No streams available</option>
            ) : (
              streamNames.map((streamName) => (
                <option key={streamName} value={streamName}>
                  {streamName}
                </option>
              ))
            )}
          </Select>

          <Button onClick={() => refetch()} disabled={!selectedStream} variant="outline">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>

          <Button
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              if (showCreateForm) {
                setCloneMessage(null);
                setFormData(DEFAULT_CONSUMER_FORM);
              }
            }}
            disabled={!selectedStream}
          >
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreateForm ? 'Cancel' : 'Create Consumer'}
          </Button>
          <Button
            variant="destructive"
            onClick={handleBulkDeleteConsumers}
            disabled={selectedConsumers.size === 0 || deleteConsumer.isPending}
          >
            Delete Selected ({selectedConsumers.size})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Consumers</p>
            <p className="text-2xl font-semibold">{healthSummary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-2xl font-semibold">{healthSummary.totalPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ack Pending</p>
            <p className="text-2xl font-semibold">{healthSummary.totalAckPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Potentially Stalled</p>
            <p
              className={`text-2xl font-semibold ${healthSummary.stalled > 0 ? 'text-destructive' : ''}`}
            >
              {healthSummary.stalled}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Consumer Lag Analytics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Total Pending</p>
              <p className="font-semibold">{analyticsData?.total_pending ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ack Pending</p>
              <p className="font-semibold">{analyticsData?.total_ack_pending ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Stream Lag</p>
              <p className="font-semibold">{analyticsData?.max_stream_lag ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Consumers</p>
              <p className="font-semibold">{analyticsData?.total_consumers ?? 0}</p>
            </div>
          </div>
          <div className="space-y-2">
            {(analyticsData?.consumers || []).slice(0, 8).map((metric) => {
              const width = Math.max(
                2,
                Math.round(
                  (metric.stream_lag / Math.max(1, analyticsData?.max_stream_lag || 1)) * 100,
                ),
              );
              return (
                <div key={metric.name} className="rounded border p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{metric.name}</span>
                    <span className="text-muted-foreground">
                      lag {metric.stream_lag} | pending {metric.num_pending} | ack{' '}
                      {metric.num_ack_pending}
                    </span>
                  </div>
                  <div className="mt-1 h-2 bg-muted rounded overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
            {!analyticsData?.consumers?.length && (
              <p className="text-sm text-muted-foreground">No analytics data available.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create Consumer</CardTitle>
          </CardHeader>
          <CardContent>
            {cloneMessage && (
              <Alert className="mb-4">
                <AlertDescription>{cloneMessage}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleCreateConsumer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>Durable Name</Label>
                  <Input
                    ref={durableNameRef}
                    type="text"
                    value={formData.durable_name || ''}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, durable_name: event.target.value }))
                    }
                    placeholder="order-worker"
                  />
                </label>

                <label className="space-y-1">
                  <Label>Consumer Name (optional)</Label>
                  <Input
                    type="text"
                    value={formData.name || ''}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="consumer-name"
                  />
                </label>

                <label className="space-y-1">
                  <Label>Filter Subject</Label>
                  <Input
                    type="text"
                    value={formData.filter_subject || ''}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, filter_subject: event.target.value }))
                    }
                    placeholder="orders.created"
                  />
                </label>

                <label className="space-y-1">
                  <Label>Description</Label>
                  <Input
                    type="text"
                    value={formData.description || ''}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Processes order events"
                  />
                </label>

                <label className="space-y-1">
                  <Label>Ack Policy</Label>
                  <Select
                    value={formData.ack_policy}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        ack_policy: event.target.value as ConsumerConfig['ack_policy'],
                      }))
                    }
                  >
                    <option value="explicit">explicit</option>
                    <option value="all">all</option>
                    <option value="none">none</option>
                  </Select>
                </label>

                <label className="space-y-1">
                  <Label>Deliver Policy</Label>
                  <Select
                    value={formData.deliver_policy}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        deliver_policy: event.target.value as ConsumerConfig['deliver_policy'],
                      }))
                    }
                  >
                    <option value="all">all</option>
                    <option value="last">last</option>
                    <option value="new">new</option>
                    <option value="by_start_sequence">by_start_sequence</option>
                    <option value="by_start_time">by_start_time</option>
                    <option value="last_per_subject">last_per_subject</option>
                  </Select>
                </label>

                <label className="space-y-1">
                  <Label>Ack Wait (nanoseconds)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.ack_wait ?? 30_000_000_000}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, ack_wait: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className="space-y-1">
                  <Label>Max Deliver</Label>
                  <Input
                    type="number"
                    value={formData.max_deliver ?? -1}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, max_deliver: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className="space-y-1">
                  <Label>Max Ack Pending</Label>
                  <Input
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
                </label>

                <label className="space-y-1">
                  <Label>Max Waiting</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.max_waiting ?? 512}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, max_waiting: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className="space-y-1">
                  <Label>Rate Limit (bytes/sec)</Label>
                  <Input
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
                </label>

                <label className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={formData.headers_only ?? false}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        headers_only: (e.target as HTMLInputElement).checked,
                      }))
                    }
                  />
                  <Label>Headers Only</Label>
                </label>
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex justify-end">
                <Button type="submit" disabled={createConsumer.isPending}>
                  {createConsumer.isPending ? 'Creating...' : 'Create Consumer'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        {!selectedStream ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Create a stream first to manage consumers.
          </CardContent>
        ) : isLoading ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading consumers...
          </CardContent>
        ) : consumersData?.consumers && consumersData.consumers.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        !!consumersData?.consumers?.length &&
                        selectedConsumers.size === consumersData.consumers.length
                      }
                      onChange={toggleSelectAllConsumers}
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
                {consumersData.consumers
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((consumer) => (
                    <>
                      <TableRow key={consumer.name}>
                        <TableCell>
                          <Checkbox
                            checked={selectedConsumers.has(consumer.name)}
                            onChange={() => toggleSelectConsumer(consumer.name)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{consumer.name}</TableCell>
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
              pageCount={Math.ceil(consumersData.consumers.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={consumersData.consumers.length}
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
