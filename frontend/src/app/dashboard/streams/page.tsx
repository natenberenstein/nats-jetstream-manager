'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams, useDeleteStream, useCreateStream, useUpdateStream } from '@/hooks/useStreams';
import { streamUpdateSchema, StreamUpdateFormData } from '@/lib/schemas';
import { StreamInfo } from '@/lib/types';
import { Plus, Trash2, RefreshCw, X, Pencil } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';

function StreamEditForm({
  stream,
  connectionId,
  onClose,
}: {
  stream: StreamInfo;
  connectionId: string;
  onClose: () => void;
}) {
  const updateStream = useUpdateStream(connectionId, stream.config.name);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StreamUpdateFormData>({
    resolver: zodResolver(streamUpdateSchema),
    defaultValues: {
      subjects: stream.config.subjects.join(', '),
      description: stream.config.description || '',
      retention: stream.config.retention || 'limits',
      max_consumers: stream.config.max_consumers ?? -1,
      max_msgs: stream.config.max_msgs ?? -1,
      max_bytes: stream.config.max_bytes ?? -1,
      max_age: stream.config.max_age ?? 0,
      max_msg_size: stream.config.max_msg_size ?? -1,
      discard: stream.config.discard || 'old',
      replicas: stream.config.replicas ?? 1,
    },
  });

  const onSubmit = async (data: StreamUpdateFormData) => {
    const subjects = data.subjects
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (subjects.length === 0) {
      toast.error('At least one subject is required.');
      return;
    }

    try {
      await updateStream.mutateAsync({
        name: stream.config.name,
        subjects,
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
      toast.success(`Stream "${stream.config.name}" updated successfully.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update stream');
    }
  };

  return (
    <TableRow>
      <TableCell colSpan={8}>
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Stream: {stream.config.name}</CardTitle>
            <CardDescription>
              Name and storage type cannot be changed after creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label className="text-muted-foreground">Name (read-only)</Label>
                  <Input value={stream.config.name} disabled />
                </label>

                <label className="space-y-1">
                  <Label className="text-muted-foreground">Storage (read-only)</Label>
                  <Input value={stream.config.storage || 'file'} disabled />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <Label>Subjects (comma-separated)</Label>
                  <Input {...register('subjects')} placeholder="orders.created, orders.updated" />
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
                  <Select {...register('retention')}>
                    <option value="limits">limits</option>
                    <option value="interest">interest</option>
                    <option value="workqueue">workqueue</option>
                  </Select>
                  {errors.retention && (
                    <p className="text-xs text-destructive">{errors.retention.message}</p>
                  )}
                </label>

                <label className="space-y-1">
                  <Label>Discard Policy</Label>
                  <Select {...register('discard')}>
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
                  <Input type="number" {...register('max_age')} />
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

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateStream.isPending}>
                  {updateStream.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TableCell>
    </TableRow>
  );
}

export default function StreamsPage() {
  const { connectionId } = useConnection();
  const { data: streamsData, isLoading, refetch } = useStreams(connectionId);
  const deleteStream = useDeleteStream(connectionId);
  const createStream = useCreateStream(connectionId);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingStream, setEditingStream] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    subjects: '',
    storage: 'file' as 'file' | 'memory',
    description: '',
  });
  const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set());

  const handleDelete = async (streamName: string) => {
    if (confirm(`Are you sure you want to delete stream "${streamName}"?`)) {
      try {
        await deleteStream.mutateAsync(streamName);
        toast.success(`Stream "${streamName}" deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete stream');
      }
    }
  };

  const toggleSelectStream = (streamName: string) => {
    setSelectedStreams((prev) => {
      const next = new Set(prev);
      if (next.has(streamName)) next.delete(streamName);
      else next.add(streamName);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!streamsData?.streams?.length) return;
    setSelectedStreams((prev) =>
      prev.size === streamsData.streams.length
        ? new Set()
        : new Set(streamsData.streams.map((s) => s.config.name)),
    );
  };

  const handleBulkDelete = async () => {
    if (selectedStreams.size === 0) return;
    const names = Array.from(selectedStreams);
    const confirmed = window.confirm(
      `Dry run preview:\n${names.slice(0, 10).join('\n')}\n\nDelete ${names.length} streams?`,
    );
    if (!confirmed) return;
    const guard = window.prompt('Type DELETE to confirm bulk stream deletion:');
    if (guard !== 'DELETE') return;
    for (const name of names) {
      try {
        await deleteStream.mutateAsync(name);
      } catch (error) {
        console.error('Bulk delete failed for stream', name, error);
      }
    }
    setSelectedStreams(new Set());
  };

  const handleCreateStream = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const name = createForm.name.trim();
    const subjects = createForm.subjects
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name) {
      setCreateError('Stream name is required.');
      return;
    }
    if (subjects.length === 0) {
      setCreateError('At least one subject is required.');
      return;
    }

    try {
      await createStream.mutateAsync({
        name,
        subjects,
        storage: createForm.storage,
        description: createForm.description.trim() || undefined,
      });
      setCreateForm({
        name: '',
        subjects: '',
        storage: 'file',
        description: '',
      });
      setShowCreateForm(false);
      toast.success(`Stream "${name}" created successfully.`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create stream');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Streams</h1>
          <p className="text-muted-foreground">Manage your JetStream streams</p>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            className="flex items-center gap-2"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreateForm ? 'Cancel' : 'Create Stream'}
          </Button>
          <Button
            variant="destructive"
            disabled={selectedStreams.size === 0 || deleteStream.isPending}
            onClick={handleBulkDelete}
          >
            Delete Selected ({selectedStreams.size})
          </Button>
        </div>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create Stream</CardTitle>
            <CardDescription>Define stream name and subject patterns.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateStream} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="orders"
                  />
                </label>

                <label className="space-y-1">
                  <Label>Storage</Label>
                  <Select
                    value={createForm.storage}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        storage: e.target.value as 'file' | 'memory',
                      }))
                    }
                  >
                    <option value="file">file</option>
                    <option value="memory">memory</option>
                  </Select>
                </label>
              </div>

              <label className="space-y-1 block">
                <Label>Subjects (comma-separated)</Label>
                <Input
                  value={createForm.subjects}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subjects: e.target.value }))}
                  placeholder="orders.created, orders.updated"
                />
              </label>

              <label className="space-y-1 block">
                <Label>Description (optional)</Label>
                <Input
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Order domain events"
                />
              </label>

              {createError && <p className="text-sm text-destructive">{createError}</p>}

              <div className="flex justify-end">
                <Button type="submit" disabled={createStream.isPending}>
                  {createStream.isPending ? 'Creating...' : 'Create Stream'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Streams Table */}
      <Card>
        {isLoading ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading streams...
          </CardContent>
        ) : streamsData?.streams && streamsData.streams.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        !!streamsData?.streams?.length &&
                        selectedStreams.size === streamsData.streams.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Consumers</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streamsData.streams
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((stream) => (
                    <>
                      <TableRow key={stream.config.name}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStreams.has(stream.config.name)}
                            onChange={() => toggleSelectStream(stream.config.name)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{stream.config.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {stream.config.subjects.join(', ')}
                        </TableCell>
                        <TableCell>{formatNumber(stream.state.messages)}</TableCell>
                        <TableCell>{formatBytes(stream.state.bytes)}</TableCell>
                        <TableCell>{stream.state.consumer_count}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-md">
                            {stream.config.storage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            onClick={() =>
                              setEditingStream(
                                editingStream === stream.config.name ? null : stream.config.name,
                              )
                            }
                            variant="ghost"
                            size="icon"
                            title="Edit stream"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => handleDelete(stream.config.name)}
                            variant="ghost"
                            size="icon"
                            disabled={deleteStream.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {editingStream === stream.config.name && connectionId && (
                        <StreamEditForm
                          key={`edit-${stream.config.name}`}
                          stream={stream}
                          connectionId={connectionId}
                          onClose={() => setEditingStream(null)}
                        />
                      )}
                    </>
                  ))}
              </TableBody>
            </Table>
            <Pagination
              pageIndex={pageIndex}
              pageCount={Math.ceil(streamsData.streams.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={streamsData.streams.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No streams found</p>
            <Button disabled>
              <Plus className="w-4 h-4" />
              Create Your First Stream
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
