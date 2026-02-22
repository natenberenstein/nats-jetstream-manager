'use client';

import { useState } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams, useDeleteStream, useCreateStream } from '@/hooks/useStreams';
import { Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useUiRole } from '@/hooks/useUiRole';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function StreamsPage() {
  const { connectionId } = useConnection();
  const { isAdmin } = useUiRole();
  const { data: streamsData, isLoading, refetch } = useStreams(connectionId);
  const deleteStream = useDeleteStream(connectionId);
  const createStream = useCreateStream(connectionId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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
      } catch (err) {
        console.error('Failed to delete stream:', err);
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
        : new Set(streamsData.streams.map((s) => s.config.name))
    );
  };

  const handleBulkDelete = async () => {
    if (!isAdmin || selectedStreams.size === 0) return;
    const names = Array.from(selectedStreams);
    const confirmed = window.confirm(
      `Dry run preview:\n${names.slice(0, 10).join('\n')}\n\nDelete ${names.length} streams?`
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

    if (!isAdmin) {
      setCreateError('Only admins can create streams.');
      return;
    }

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
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create stream');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">
            Streams
          </h1>
          <p className="text-muted-foreground">
            Manage your JetStream streams
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => refetch()}
            variant="outline"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            className="flex items-center gap-2"
            onClick={() => setShowCreateForm((prev) => !prev)}
            disabled={!isAdmin}
          >
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreateForm ? 'Cancel' : 'Create Stream'}
          </Button>
          <Button
            variant="destructive"
            disabled={!isAdmin || selectedStreams.size === 0 || deleteStream.isPending}
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
                      setCreateForm((prev) => ({ ...prev, storage: e.target.value as 'file' | 'memory' }))
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
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Order domain events"
                />
              </label>

              {createError && <p className="text-sm text-destructive">{createError}</p>}

              <div className="flex justify-end">
                <Button type="submit" disabled={createStream.isPending || !isAdmin}>
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
                      disabled={!isAdmin}
                    />
                  </TableHead>
                  <TableHead>
                    Name
                  </TableHead>
                  <TableHead>
                    Subjects
                  </TableHead>
                  <TableHead>
                    Messages
                  </TableHead>
                  <TableHead>
                    Storage
                  </TableHead>
                  <TableHead>
                    Consumers
                  </TableHead>
                  <TableHead>
                    Type
                  </TableHead>
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {streamsData.streams.map((stream) => (
                  <TableRow
                    key={stream.config.name}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedStreams.has(stream.config.name)}
                        onChange={() => toggleSelectStream(stream.config.name)}
                        disabled={!isAdmin}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {stream.config.name}
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
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleDelete(stream.config.name)}
                        variant="ghost"
                        size="icon"
                        disabled={!isAdmin || deleteStream.isPending}
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
              No streams found
            </p>
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
