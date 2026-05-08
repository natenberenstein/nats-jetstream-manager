'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { usePurgeStream, useStream, useUpdateStream } from '@/hooks/useStreams';
import { useConsumers } from '@/hooks/useConsumers';
import { useStreamMetrics } from '@/hooks/useMetrics';
import { streamUpdateSchema, StreamUpdateFormData } from '@/lib/schemas';
import { copyText, downloadFile } from '@/lib/download';
import { formatBytes, formatNumber } from '@/lib/utils';
import { ArrowLeft, Copy, Download, Flame, Users, MessageSquare, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SubjectChip, SubjectChips } from '@/components/subjects/SubjectChips';

export default function StreamDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const streamName = decodeURIComponent(name);
  const { connectionId } = useConnection();
  const {
    data: stream,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useStream(connectionId, streamName);
  const { data: consumersData } = useConsumers(connectionId, streamName);
  const { data: metricsData } = useStreamMetrics(connectionId, streamName, 60);
  const purgeStream = usePurgeStream(connectionId);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);

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

  if (!stream) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Stream &ldquo;{streamName}&rdquo; not found.
      </div>
    );
  }

  const config = stream.config;
  const state = stream.state;
  const maxBytes = config.max_bytes ?? -1;
  const storagePct = maxBytes > 0 ? Math.min(100, (state.bytes / maxBytes) * 100) : null;
  const avgByteRate = metricsData?.points.length
    ? metricsData.points.reduce((sum, point) => sum + Math.max(0, point.byte_rate), 0) /
      metricsData.points.length
    : 0;
  const secondsToFull =
    maxBytes > 0 && avgByteRate > 0 ? Math.max(0, (maxBytes - state.bytes) / avgByteRate) : null;

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '-';
    if (seconds <= 0) return 'now';
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
    return `${Math.ceil(seconds / 86400)}d`;
  };

  const streamCliCommand = [
    'nats stream add',
    config.name,
    `--subjects "${config.subjects.join(',')}"`,
    `--storage ${config.storage || 'file'}`,
    `--retention ${config.retention || 'limits'}`,
    `--discard ${config.discard || 'old'}`,
    `--replicas ${config.replicas ?? 1}`,
  ].join(' ');

  const handleExportConfig = () => {
    downloadFile(
      `${config.name}-stream-config.json`,
      JSON.stringify(config, null, 2),
      'application/json',
    );
  };

  const handleCopyCli = async () => {
    await copyText(streamCliCommand);
    toast.success('Copied stream CLI command.');
  };

  const handlePurge = async () => {
    const ok = await confirm({
      title: 'Purge stream',
      description: (
        <>
          This removes {formatNumber(state.messages)} message
          {state.messages === 1 ? '' : 's'} from{' '}
          <span className="font-mono font-semibold">{config.name}</span> without deleting the stream
          or its consumers.
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Purge stream',
      requireTypedConfirmation: config.name,
    });
    if (!ok) return;
    try {
      await purgeStream.mutateAsync(config.name);
      toast.success(`Stream "${config.name}" purged.`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to purge stream');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={config.name}
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
            <Link href="/dashboard/streams">
              <Button variant="outline" size="icon" aria-label="Back to streams">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={handleCopyCli}>
              <Copy className="w-4 h-4" />
              Copy CLI
            </Button>
            <Button variant="outline" onClick={handleExportConfig}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              variant="destructive"
              onClick={handlePurge}
              disabled={state.messages === 0 || purgeStream.isPending}
            >
              <Flame className="w-4 h-4" />
              Purge
            </Button>
            <Link href={`/dashboard/consumers?stream=${encodeURIComponent(streamName)}`}>
              <Button variant="outline">
                <Users className="w-4 h-4" />
                View Consumers
              </Button>
            </Link>
            <Link href={`/dashboard/messages?stream=${encodeURIComponent(streamName)}`}>
              <Button variant="outline">
                <MessageSquare className="w-4 h-4" />
                View Messages
              </Button>
            </Link>
          </>
        }
      />

      {connectionId && (
        <StreamEditDialog
          open={editing}
          onOpenChange={setEditing}
          stream={stream}
          connectionId={connectionId}
          onSuccess={() => {
            refetch();
            setEditing(false);
          }}
        />
      )}

      {/* State Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Messages</p>
            <p className="text-xl font-semibold">{formatNumber(state.messages)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="text-xl font-semibold">{formatBytes(state.bytes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Consumers</p>
            <p className="text-xl font-semibold">{state.consumer_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sequence Range</p>
            <p className="text-xl font-semibold">
              {state.first_seq} - {state.last_seq}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capacity Forecast</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Storage Limit</p>
            <p className="text-lg font-semibold">
              {maxBytes > 0 ? formatBytes(maxBytes) : 'Unlimited'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Average Write Rate</p>
            <p className="text-lg font-semibold">{formatBytes(avgByteRate)}/s</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time To Full</p>
            <p className="text-lg font-semibold">{formatDuration(secondsToFull)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Retention Horizon</p>
            <p className="text-lg font-semibold">
              {config.max_age && config.max_age > 0 ? formatDuration(config.max_age) : 'Unlimited'}
            </p>
          </div>
          {storagePct !== null && (
            <div className="md:col-span-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{formatBytes(state.bytes)} used</span>
                <span>{storagePct.toFixed(0)}%</span>
              </div>
              <Progress
                value={storagePct}
                className={
                  storagePct >= 90
                    ? '[&>div]:bg-destructive'
                    : storagePct >= 75
                      ? '[&>div]:bg-warning'
                      : ''
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mirror & Sources */}
      {config.mirror && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mirror</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-md">
                Mirror
              </Badge>
              <Link
                href={`/dashboard/streams/${encodeURIComponent(config.mirror.name)}`}
                className="text-primary hover:underline font-medium"
              >
                {config.mirror.name}
              </Link>
              {config.mirror.filter_subject && (
                <SubjectChip subject={config.mirror.filter_subject} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {config.sources && config.sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {config.sources.map((source) => (
                <div key={source.name} className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">
                    Source
                  </Badge>
                  <Link
                    href={`/dashboard/streams/${encodeURIComponent(source.name)}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {source.name}
                  </Link>
                  {source.filter_subject && <SubjectChip subject={source.filter_subject} />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium w-48">Subjects</TableCell>
                <TableCell>
                  <SubjectChips subjects={config.subjects} maxVisible={4} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Storage</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-md">
                    {config.storage}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Retention</TableCell>
                <TableCell>{config.retention}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Discard Policy</TableCell>
                <TableCell>{config.discard}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Replicas</TableCell>
                <TableCell>{config.replicas}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Consumers</TableCell>
                <TableCell>
                  {config.max_consumers === -1 ? 'Unlimited' : config.max_consumers}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Messages</TableCell>
                <TableCell>
                  {config.max_msgs === -1 ? 'Unlimited' : formatNumber(config.max_msgs ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Bytes</TableCell>
                <TableCell>
                  {config.max_bytes === -1 ? 'Unlimited' : formatBytes(config.max_bytes ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Age</TableCell>
                <TableCell>{config.max_age === 0 ? 'Unlimited' : `${config.max_age}s`}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Message Size</TableCell>
                <TableCell>
                  {config.max_msg_size === -1 ? 'Unlimited' : formatBytes(config.max_msg_size ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Created</TableCell>
                <TableCell>{new Date(stream.created).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Consumers List */}
      {consumersData && consumersData.consumers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Consumers ({consumersData.consumers.length})
              </CardTitle>
              <Link href={`/dashboard/consumers?stream=${encodeURIComponent(streamName)}`}>
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Filter</TableHead>
                  <TableHead>Ack Policy</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Ack Pending</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumersData.consumers.slice(0, 10).map((consumer) => (
                  <TableRow key={consumer.name}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/consumers/${encodeURIComponent(streamName)}/${encodeURIComponent(consumer.name)}`}
                        className="text-primary hover:underline"
                      >
                        {consumer.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SubjectChip subject={consumer.config.filter_subject} />
                    </TableCell>
                    <TableCell>{consumer.config.ack_policy}</TableCell>
                    <TableCell>{consumer.num_pending}</TableCell>
                    <TableCell>{consumer.num_ack_pending}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(consumer.created).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StreamEditDialog({
  open,
  onOpenChange,
  stream,
  connectionId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stream: { config: import('@/lib/types').StreamConfig; created: string };
  connectionId: string;
  onSuccess: () => void;
}) {
  const config = stream.config;
  const updateStream = useUpdateStream(connectionId, config.name);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<StreamUpdateFormData>({
    resolver: zodResolver(streamUpdateSchema),
    defaultValues: {
      subjects: config.subjects.join(', '),
      description: config.description || '',
      retention: config.retention || 'limits',
      max_consumers: config.max_consumers ?? -1,
      max_msgs: config.max_msgs ?? -1,
      max_bytes: config.max_bytes ?? -1,
      max_age: config.max_age ?? 0,
      max_msg_size: config.max_msg_size ?? -1,
      discard: config.discard || 'old',
      replicas: config.replicas ?? 1,
    },
  });

  const onSubmit = async (data: StreamUpdateFormData) => {
    try {
      await updateStream.mutateAsync({
        subjects: data.subjects
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        description: data.description || undefined,
        retention: data.retention,
        max_consumers: data.max_consumers,
        max_msgs: data.max_msgs,
        max_bytes: data.max_bytes,
        max_age: data.max_age,
        max_msg_size: data.max_msg_size,
        discard: data.discard,
        replicas: data.replicas,
      });
      toast.success(`Stream "${config.name}" updated successfully.`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update stream');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Stream: {config.name}</DialogTitle>
          <DialogDescription>Modify the mutable configuration for this stream.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Immutable fields */}
          <div className="rounded border border-muted p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Cannot be changed after creation
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <Label className="text-muted-foreground">Name</Label>
                <Input value={config.name} disabled />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">Storage</Label>
                <Input value={config.storage || 'file'} disabled />
              </div>
            </div>
          </div>

          {/* Mutable fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit-subjects">Subjects (comma-separated)</Label>
              <Input id="edit-subjects" {...register('subjects')} placeholder="orders.>" />
              {errors.subjects && (
                <p className="text-xs text-destructive">{errors.subjects.message}</p>
              )}
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                {...register('description')}
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-retention">Retention</Label>
              <Select
                value={watch('retention')}
                onValueChange={(value) =>
                  setValue('retention', value as 'limits' | 'interest' | 'workqueue')
                }
              >
                <SelectTrigger id="edit-retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="limits">limits</SelectItem>
                  <SelectItem value="interest">interest</SelectItem>
                  <SelectItem value="workqueue">workqueue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-discard">Discard Policy</Label>
              <Select
                value={watch('discard')}
                onValueChange={(value) => setValue('discard', value as 'old' | 'new')}
              >
                <SelectTrigger id="edit-discard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="old">old</SelectItem>
                  <SelectItem value="new">new</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-max-consumers">Max Consumers (-1 = unlimited)</Label>
              <Input id="edit-max-consumers" type="number" {...register('max_consumers')} />
              {errors.max_consumers && (
                <p className="text-xs text-destructive">{errors.max_consumers.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-max-msgs">Max Messages (-1 = unlimited)</Label>
              <Input id="edit-max-msgs" type="number" {...register('max_msgs')} />
              {errors.max_msgs && (
                <p className="text-xs text-destructive">{errors.max_msgs.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-max-bytes">Max Bytes (-1 = unlimited)</Label>
              <Input id="edit-max-bytes" type="number" {...register('max_bytes')} />
              {errors.max_bytes && (
                <p className="text-xs text-destructive">{errors.max_bytes.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-max-age">Max Age (seconds, 0 = unlimited)</Label>
              <Input id="edit-max-age" type="number" min={0} {...register('max_age')} />
              {errors.max_age && (
                <p className="text-xs text-destructive">{errors.max_age.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-max-msg-size">Max Message Size (-1 = unlimited)</Label>
              <Input id="edit-max-msg-size" type="number" {...register('max_msg_size')} />
              {errors.max_msg_size && (
                <p className="text-xs text-destructive">{errors.max_msg_size.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-replicas">Replicas</Label>
              <Input id="edit-replicas" type="number" min={1} {...register('replicas')} />
              {errors.replicas && (
                <p className="text-xs text-destructive">{errors.replicas.message}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateStream.isPending}>
              {updateStream.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
