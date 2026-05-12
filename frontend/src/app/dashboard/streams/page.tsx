'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams, useDeleteStream, useCreateStream, useUpdateStream } from '@/hooks/useStreams';
import { streamUpdateSchema, StreamUpdateFormData } from '@/lib/schemas';
import { StreamInfo } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Database,
  HardDrive,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn, formatBytes, formatNumber } from '@/lib/utils';
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
import { SubjectChips } from '@/components/subjects/SubjectChips';

type StreamCreateFormState = {
  name: string;
  subjects: string;
  storage: 'file' | 'memory';
  description: string;
  retention: 'limits' | 'interest' | 'workqueue';
  max_consumers: number;
  max_msgs: number;
  max_bytes: number;
  max_age: number;
  max_msg_size: number;
  discard: 'old' | 'new';
  duplicate_window: number;
  replicas: number;
  no_ack: boolean;
};

const DEFAULT_CREATE_STREAM_FORM: StreamCreateFormState = {
  name: '',
  subjects: '',
  storage: 'file',
  description: '',
  retention: 'limits',
  max_consumers: -1,
  max_msgs: -1,
  max_bytes: -1,
  max_age: 0,
  max_msg_size: -1,
  discard: 'old',
  duplicate_window: 120,
  replicas: 1,
  no_ack: false,
};

const STREAM_PRESETS: Array<{
  label: string;
  description: string;
  values: Partial<StreamCreateFormState>;
}> = [
  {
    label: 'Event log',
    description: 'Durable append log with limit-based retention.',
    values: {
      retention: 'limits',
      storage: 'file',
      discard: 'old',
      max_msgs: -1,
      max_age: 0,
      duplicate_window: 120,
      replicas: 1,
    },
  },
  {
    label: 'Work queue',
    description: 'Messages are removed after a worker acknowledges them.',
    values: {
      retention: 'workqueue',
      storage: 'file',
      discard: 'old',
      max_age: 0,
      max_consumers: -1,
      replicas: 1,
    },
  },
  {
    label: 'Retry/DLQ',
    description: 'Bounded stream for replay and failure handling.',
    values: {
      retention: 'limits',
      storage: 'file',
      discard: 'old',
      max_age: 604800,
      max_bytes: -1,
      max_msgs: -1,
      duplicate_window: 300,
      replicas: 1,
    },
  },
  {
    label: 'Short cache',
    description: 'Small memory-backed stream for recent state or tests.',
    values: {
      retention: 'limits',
      storage: 'memory',
      discard: 'old',
      max_msgs: 10000,
      max_age: 3600,
      max_bytes: -1,
      replicas: 1,
    },
  },
];

function retentionBadgeClass(retention?: string) {
  switch (retention) {
    case 'workqueue':
      return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
    case 'interest':
      return 'border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300';
    default:
      return 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
  }
}

function storageBadgeClass(storage?: string) {
  return storage === 'memory'
    ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
    : 'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300';
}

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
  const router = useRouter();
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
  const [createForm, setCreateForm] = useState<StreamCreateFormState>(DEFAULT_CREATE_STREAM_FORM);
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
      requireTypedConfirmation: streamName,
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
        retention: createForm.retention,
        max_consumers: createForm.max_consumers,
        max_msgs: createForm.max_msgs,
        max_bytes: createForm.max_bytes,
        max_age: createForm.max_age,
        max_msg_size: createForm.max_msg_size,
        discard: createForm.discard,
        duplicate_window: createForm.duplicate_window,
        replicas: createForm.replicas,
        no_ack: createForm.no_ack,
      });
      setCreateForm(DEFAULT_CREATE_STREAM_FORM);
      setShowCreateForm(false);
      toast.success(`Stream "${name}" created successfully.`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create stream');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
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

      <Dialog
        open={showCreateForm}
        onOpenChange={(open) => {
          setShowCreateForm(open);
          if (!open) {
            setCreateForm(DEFAULT_CREATE_STREAM_FORM);
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Stream</DialogTitle>
            <DialogDescription>
              Define subject routing, retention, storage, and limits.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStream} className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              {STREAM_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 whitespace-normal p-3 text-left"
                  onClick={() =>
                    setCreateForm((prev) => ({
                      ...prev,
                      ...preset.values,
                    }))
                  }
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {preset.description}
                  </span>
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <Label htmlFor="create-retention">Retention</Label>
                <Select
                  value={createForm.retention}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      retention: value as StreamCreateFormState['retention'],
                    }))
                  }
                >
                  <SelectTrigger id="create-retention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="limits">limits</SelectItem>
                    <SelectItem value="interest">interest</SelectItem>
                    <SelectItem value="workqueue">workqueue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="create-subjects">Subjects (comma-separated)</Label>
                <Input
                  id="create-subjects"
                  value={createForm.subjects}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, subjects: e.target.value }))}
                  placeholder="orders.created, orders.updated"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
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

              <div className="space-y-1">
                <Label htmlFor="create-storage">Storage</Label>
                <Select
                  value={createForm.storage}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      storage: value as StreamCreateFormState['storage'],
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

              <div className="space-y-1">
                <Label htmlFor="create-discard">Discard Policy</Label>
                <Select
                  value={createForm.discard}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      discard: value as StreamCreateFormState['discard'],
                    }))
                  }
                >
                  <SelectTrigger id="create-discard">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="old">old</SelectItem>
                    <SelectItem value="new">new</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="space-y-1">
                <Label>Max Consumers (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={createForm.max_consumers}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      max_consumers: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Max Messages (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={createForm.max_msgs}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, max_msgs: Number(event.target.value) }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Max Bytes (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={createForm.max_bytes}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, max_bytes: Number(event.target.value) }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Max Age (seconds, 0 = unlimited)</Label>
                <Input
                  type="number"
                  min={0}
                  value={createForm.max_age}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, max_age: Number(event.target.value) }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Max Message Size (-1 = unlimited)</Label>
                <Input
                  type="number"
                  value={createForm.max_msg_size}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      max_msg_size: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Duplicate Window (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={createForm.duplicate_window}
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      duplicate_window: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label className="space-y-1">
                <Label>Replicas</Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.replicas}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, replicas: Number(event.target.value) }))
                  }
                />
              </label>

              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="create-no-ack"
                  checked={createForm.no_ack}
                  onCheckedChange={(checked) =>
                    setCreateForm((prev) => ({ ...prev, no_ack: checked === true }))
                  }
                />
                <Label htmlFor="create-no-ack">No Ack</Label>
              </div>

              <div className="rounded-md border p-3 text-xs text-muted-foreground md:col-span-2">
                {createForm.retention === 'workqueue'
                  ? 'Work queue retention removes messages after consumers acknowledge them.'
                  : createForm.retention === 'interest'
                    ? 'Interest retention keeps messages while matching consumers still need them.'
                    : 'Limits retention keeps messages until size, count, or age limits are reached.'}
                {createForm.discard === 'new'
                  ? ' New messages are rejected when limits are reached.'
                  : ' Old messages are evicted first when limits are reached.'}
              </div>
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
                  .map((stream) => {
                    const maxBytes = stream.config.max_bytes ?? -1;
                    const usedBytes = stream.state.bytes;
                    const usedPct =
                      maxBytes > 0 ? Math.min(100, (usedBytes / maxBytes) * 100) : null;
                    const encoded = encodeURIComponent(stream.config.name);
                    return (
                      <React.Fragment key={stream.config.name}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <TableRow
                              className={cn(
                                'border-l-4 border-l-transparent',
                                usedPct !== null &&
                                  usedPct >= 90 &&
                                  'border-l-destructive bg-destructive/5',
                                usedPct !== null &&
                                  usedPct >= 75 &&
                                  usedPct < 90 &&
                                  'border-l-warning bg-warning/5',
                              )}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedStreams.has(stream.config.name)}
                                  onCheckedChange={() => toggleSelectStream(stream.config.name)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                <Link
                                  href={`/dashboard/streams/${encoded}`}
                                  className="text-primary hover:underline"
                                >
                                  {stream.config.name}
                                </Link>
                                {stream.config.mirror && (
                                  <Badge variant="outline" className="ml-2 rounded-md text-xs">
                                    mirror
                                  </Badge>
                                )}
                                {stream.config.sources && stream.config.sources.length > 0 && (
                                  <Badge variant="outline" className="ml-2 rounded-md text-xs">
                                    {stream.config.sources.length} source
                                    {stream.config.sources.length > 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[360px] text-muted-foreground">
                                <SubjectChips subjects={stream.config.subjects} maxVisible={2} />
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="gap-1 rounded-md border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  {formatNumber(stream.state.messages)}
                                </Badge>
                              </TableCell>
                              <TableCell className="min-w-[160px]">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="font-medium">{formatBytes(usedBytes)}</span>
                                    {usedPct !== null && (
                                      <span className="text-muted-foreground">
                                        {usedPct.toFixed(0)}% of {formatBytes(maxBytes)}
                                      </span>
                                    )}
                                  </div>
                                  {usedPct !== null && (
                                    <Progress
                                      value={usedPct}
                                      aria-label={`Storage used: ${usedPct.toFixed(0)}%`}
                                      className={
                                        usedPct >= 90
                                          ? '[&>div]:bg-destructive'
                                          : usedPct >= 75
                                            ? '[&>div]:bg-warning'
                                            : ''
                                      }
                                    />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="gap-1 rounded-md border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
                                >
                                  <Users className="h-3 w-3" />
                                  {stream.state.consumer_count}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'gap-1 rounded-md',
                                      storageBadgeClass(stream.config.storage),
                                    )}
                                  >
                                    {stream.config.storage === 'memory' ? (
                                      <Database className="h-3 w-3" />
                                    ) : (
                                      <HardDrive className="h-3 w-3" />
                                    )}
                                    {stream.config.storage}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'rounded-md',
                                      retentionBadgeClass(stream.config.retention),
                                    )}
                                  >
                                    {stream.config.retention || 'limits'}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  onClick={() =>
                                    setEditingStream(
                                      editingStream === stream.config.name
                                        ? null
                                        : stream.config.name,
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
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onSelect={() => router.push(`/dashboard/streams/${encoded}`)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Open stream
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => router.push(`/dashboard/messages?stream=${encoded}`)}
                            >
                              <MessageSquare className="mr-2 h-4 w-4" />
                              View messages
                            </ContextMenuItem>
                            <ContextMenuItem
                              onSelect={() => navigator.clipboard.writeText(stream.config.name)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy name
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onSelect={() =>
                                setEditingStream(
                                  editingStream === stream.config.name ? null : stream.config.name,
                                )
                              }
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => handleDelete(stream.config.name)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                        {editingStream === stream.config.name && connectionId && (
                          <StreamEditForm
                            key={`edit-${stream.config.name}`}
                            stream={stream}
                            connectionId={connectionId}
                            onClose={() => setEditingStream(null)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
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
