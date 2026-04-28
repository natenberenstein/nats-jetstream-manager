'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams, useDeleteStream, useCreateStream, useUpdateStream } from '@/hooks/useStreams';
import { streamUpdateSchema, StreamUpdateFormData } from '@/lib/schemas';
import { StreamInfo } from '@/lib/types';
import Link from 'next/link';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { focusFirstError } from '@/lib/form-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Spinner } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BulkDeleteDialog } from '@/components/ui/bulk-delete-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    control,
    formState: { errors },
  } = useForm<StreamUpdateFormData>({
    mode: 'onSubmit',
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
            <form onSubmit={handleSubmit(onSubmit, focusFirstError)} className="space-y-4">
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

                <div className="space-y-1">
                  <Label htmlFor="edit-retention">Retention</Label>
                  <Controller
                    control={control}
                    name="retention"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="edit-retention">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="limits">limits</SelectItem>
                          <SelectItem value="interest">interest</SelectItem>
                          <SelectItem value="workqueue">workqueue</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.retention && (
                    <p className="text-xs text-destructive">{errors.retention.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-discard">Discard Policy</Label>
                  <Controller
                    control={control}
                    name="discard"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="edit-discard">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="old">old</SelectItem>
                          <SelectItem value="new">new</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

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
                  {updateStream.isPending && <Spinner />}
                  {updateStream.isPending ? 'Saving…' : 'Save Changes'}
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
  const {
    data: streamsData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useStreams(connectionId);
  const deleteStream = useDeleteStream(connectionId);
  const createStream = useCreateStream(connectionId);
  const confirm = useConfirm();

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
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const filteredStreams = useMemo(() => {
    const items = streamsData?.streams ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (s) =>
        s.config.name.toLowerCase().includes(q) ||
        s.config.subjects.some((sub) => sub.toLowerCase().includes(q)),
    );
  }, [streamsData?.streams, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const handleDelete = async (streamName: string) => {
    const ok = await confirm({
      title: 'Delete stream',
      description: (
        <>
          This permanently deletes stream{' '}
          <span className="font-mono font-semibold">{streamName}</span> and all of its messages.
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Delete stream',
    });
    if (!ok) return;
    try {
      await deleteStream.mutateAsync(streamName);
      toast.success(`Stream "${streamName}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete stream');
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

  const handleBulkDelete = () => {
    if (selectedStreams.size === 0) return;
    setBulkOpen(true);
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
      <PageHeader
        title="Streams"
        description="Manage your JetStream streams"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              Create Stream
            </Button>
            <Button
              variant="destructive"
              disabled={selectedStreams.size === 0 || deleteStream.isPending}
              onClick={handleBulkDelete}
            >
              Delete Selected ({selectedStreams.size})
            </Button>
          </>
        }
      />

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Delete selected streams"
        description="Deleting streams also removes their messages and consumers. This cannot be undone."
        items={Array.from(selectedStreams)}
        onDeleteItem={(name) => deleteStream.mutateAsync(name).then(() => undefined)}
        onFinished={({ succeeded, failed }) => {
          if (succeeded) toast.success(`Deleted ${succeeded} stream${succeeded === 1 ? '' : 's'}.`);
          if (failed.length) toast.error(`${failed.length} failed: ${failed.join(', ')}`);
          setSelectedStreams(new Set());
        }}
      />

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Stream</DialogTitle>
            <DialogDescription>Define stream name and subject patterns.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStream} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="create-name">Name</Label>
                <Input
                  id="create-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="orders"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-storage">Storage</Label>
                <Select
                  value={createForm.storage}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      storage: value as 'file' | 'memory',
                    }))
                  }
                >
                  <SelectTrigger id="create-storage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file">file</SelectItem>
                    <SelectItem value="memory">memory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-subjects">Subjects (comma-separated)</Label>
              <Input
                id="create-subjects"
                value={createForm.subjects}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, subjects: e.target.value }))}
                placeholder="orders.created, orders.updated"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="create-description">Description (optional)</Label>
              <Input
                id="create-description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Order domain events"
              />
            </div>

            {createError && <p className="text-sm text-destructive">{createError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStream.isPending}>
                {createStream.isPending && <Spinner />}
                {createStream.isPending ? 'Creating…' : 'Create Stream'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Input
        placeholder="Filter streams..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      {/* Streams Table */}
      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={6} columns={7} />
          </CardContent>
        ) : filteredStreams.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        !!filteredStreams.length && selectedStreams.size === filteredStreams.length
                      }
                      onCheckedChange={toggleSelectAll}
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
                {filteredStreams
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((stream) => (
                    <>
                      <TableRow key={stream.config.name}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStreams.has(stream.config.name)}
                            onCheckedChange={() => toggleSelectStream(stream.config.name)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/dashboard/streams/${encodeURIComponent(stream.config.name)}`}
                            className="text-primary hover:underline"
                          >
                            {stream.config.name}
                          </Link>
                          {stream.config.mirror && (
                            <span className="ml-2 text-xs text-muted-foreground">(mirror)</span>
                          )}
                          {stream.config.sources && stream.config.sources.length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({stream.config.sources.length} source
                              {stream.config.sources.length > 1 ? 's' : ''})
                            </span>
                          )}
                        </TableCell>
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
              pageCount={Math.ceil(filteredStreams.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={filteredStreams.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'No streams match your filter.' : 'No streams yet.'}
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              {searchQuery ? 'Create Stream' : 'Create Your First Stream'}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
