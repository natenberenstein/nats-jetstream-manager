'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStream, useUpdateStream } from '@/hooks/useStreams';
import { useConsumers } from '@/hooks/useConsumers';
import { streamUpdateSchema, StreamUpdateFormData } from '@/lib/schemas';
import { formatBytes, formatNumber } from '@/lib/utils';
import { ArrowLeft, Users, MessageSquare, RefreshCw, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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

export default function StreamDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const streamName = decodeURIComponent(name);
  const { connectionId } = useConnection();
  const { data: stream, isLoading, refetch } = useStream(connectionId, streamName);
  const { data: consumersData } = useConsumers(connectionId, streamName);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stream details...</div>;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/streams">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{config.name}</h1>
            {config.description && <p className="text-muted-foreground">{config.description}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
            Edit
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
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
        </div>
      </div>

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
            <p className="text-2xl font-semibold">{formatNumber(state.messages)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="text-2xl font-semibold">{formatBytes(state.bytes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Consumers</p>
            <p className="text-2xl font-semibold">{state.consumer_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sequence Range</p>
            <p className="text-2xl font-semibold">
              {state.first_seq} - {state.last_seq}
            </p>
          </CardContent>
        </Card>
      </div>

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
                <span className="text-sm text-muted-foreground">
                  (filter: {config.mirror.filter_subject})
                </span>
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
                  {source.filter_subject && (
                    <span className="text-sm text-muted-foreground">
                      (filter: {source.filter_subject})
                    </span>
                  )}
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
                <TableCell>{config.subjects.join(', ')}</TableCell>
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
      <DialogHeader onClose={() => onOpenChange(false)}>
        <DialogTitle>Edit Stream: {config.name}</DialogTitle>
        <DialogDescription>Modify the mutable configuration for this stream.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <div className="space-y-4">
            {/* Immutable fields */}
            <div className="rounded border border-muted p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Cannot be changed after creation
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <Input value={config.name} disabled />
                </div>
                <div>
                  <Label className="text-muted-foreground">Storage</Label>
                  <Input value={config.storage || 'file'} disabled />
                </div>
              </div>
            </div>

            {/* Mutable fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="space-y-1 md:col-span-2">
                <Label>Subjects (comma-separated)</Label>
                <Input {...register('subjects')} placeholder="orders.>" />
                {errors.subjects && (
                  <p className="text-xs text-destructive">{errors.subjects.message}</p>
                )}
              </label>

              <label className="space-y-1 md:col-span-2">
                <Label>Description</Label>
                <Input {...register('description')} placeholder="Optional description" />
              </label>

              <label className="space-y-1">
                <Label>Retention</Label>
                <Select
                  value={watch('retention')}
                  onChange={(e) =>
                    setValue('retention', e.target.value as 'limits' | 'interest' | 'workqueue')
                  }
                >
                  <option value="limits">limits</option>
                  <option value="interest">interest</option>
                  <option value="workqueue">workqueue</option>
                </Select>
              </label>

              <label className="space-y-1">
                <Label>Discard Policy</Label>
                <Select
                  value={watch('discard')}
                  onChange={(e) => setValue('discard', e.target.value as 'old' | 'new')}
                >
                  <option value="old">old</option>
                  <option value="new">new</option>
                </Select>
              </label>

              <label className="space-y-1">
                <Label>Max Consumers (-1 = unlimited)</Label>
                <Input type="number" {...register('max_consumers')} />
                {errors.max_consumers && (
                  <p className="text-xs text-destructive">{errors.max_consumers.message}</p>
                )}
              </label>

              <label className="space-y-1">
                <Label>Max Messages (-1 = unlimited)</Label>
                <Input type="number" {...register('max_msgs')} />
                {errors.max_msgs && (
                  <p className="text-xs text-destructive">{errors.max_msgs.message}</p>
                )}
              </label>

              <label className="space-y-1">
                <Label>Max Bytes (-1 = unlimited)</Label>
                <Input type="number" {...register('max_bytes')} />
                {errors.max_bytes && (
                  <p className="text-xs text-destructive">{errors.max_bytes.message}</p>
                )}
              </label>

              <label className="space-y-1">
                <Label>Max Age (seconds, 0 = unlimited)</Label>
                <Input type="number" min={0} {...register('max_age')} />
                {errors.max_age && (
                  <p className="text-xs text-destructive">{errors.max_age.message}</p>
                )}
              </label>

              <label className="space-y-1">
                <Label>Max Message Size (-1 = unlimited)</Label>
                <Input type="number" {...register('max_msg_size')} />
                {errors.max_msg_size && (
                  <p className="text-xs text-destructive">{errors.max_msg_size.message}</p>
                )}
              </label>

              <label className="space-y-1">
                <Label>Replicas</Label>
                <Input type="number" min={1} {...register('replicas')} />
                {errors.replicas && (
                  <p className="text-xs text-destructive">{errors.replicas.message}</p>
                )}
              </label>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateStream.isPending}>
            {updateStream.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
