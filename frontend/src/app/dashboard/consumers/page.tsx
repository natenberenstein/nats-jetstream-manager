'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams } from '@/hooks/useStreams';
import {
  useConsumers,
  useCreateConsumer,
  useDeleteConsumer,
  useConsumerAnalytics,
} from '@/hooks/useConsumers';
import { ConsumerConfig } from '@/lib/types';
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useUiRole } from '@/hooks/useUiRole';

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

export default function ConsumersPage() {
  const { connectionId } = useConnection();
  const { isAdmin } = useUiRole();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedConsumers, setSelectedConsumers] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<ConsumerConfig>(DEFAULT_CONSUMER_FORM);
  const [formError, setFormError] = useState<string | null>(null);

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
      setFormData(DEFAULT_CONSUMER_FORM);
      setShowCreateForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create consumer';
      setFormError(message);
    }
  };

  const handleDeleteConsumer = async (consumerName: string) => {
    if (!isAdmin) return;
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
    } catch (error) {
      console.error('Failed to delete consumer:', error);
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
    if (!isAdmin || !selectedStream || selectedConsumers.size === 0) return;
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
            onChange={(event) => setSelectedStream(event.target.value || null)}
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
            onClick={() => setShowCreateForm((prev) => !prev)}
            disabled={!isAdmin || !selectedStream}
          >
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreateForm ? 'Cancel' : 'Create Consumer'}
          </Button>
          <Button
            variant="destructive"
            onClick={handleBulkDeleteConsumers}
            disabled={!isAdmin || selectedConsumers.size === 0 || deleteConsumer.isPending}
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
            <form onSubmit={handleCreateConsumer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>Durable Name</Label>
                  <Input
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
                      disabled={!isAdmin}
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
                {consumersData.consumers.map((consumer) => (
                  <TableRow key={consumer.name}>
                    <TableCell>
                      <Checkbox
                        checked={selectedConsumers.has(consumer.name)}
                        onChange={() => toggleSelectConsumer(consumer.name)}
                        disabled={!isAdmin}
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
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleDeleteConsumer(consumer.name)}
                        disabled={!isAdmin || deleteConsumer.isPending}
                        variant="ghost"
                        size="icon"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
