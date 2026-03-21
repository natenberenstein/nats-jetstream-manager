'use client';

import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import {
  useKvStores,
  useCreateKvStore,
  useDeleteKvStore,
  useKvKeys,
  useKvEntry,
  usePutKvEntry,
  useDeleteKvEntry,
  useKvWatchHistory,
} from '@/hooks/useKv';
import { KvStoreStatus } from '@/lib/types';
import { Plus, Trash2, RefreshCw, Eye, ArrowLeft, Radio } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';

function KvKeyBrowser({
  connectionId,
  bucket,
  onBack,
}: {
  connectionId: string;
  bucket: KvStoreStatus;
  onBack: () => void;
}) {
  const { data: keysData, isLoading, refetch } = useKvKeys(connectionId, bucket.bucket);
  const putEntry = usePutKvEntry(connectionId, bucket.bucket);
  const deleteEntry = useDeleteKvEntry(connectionId, bucket.bucket);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { data: entryData } = useKvEntry(connectionId, bucket.bucket, selectedKey);
  const [showPutForm, setShowPutForm] = useState(false);
  const [putForm, setPutForm] = useState({ key: '', value: '' });
  const [putError, setPutError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [watchMode, setWatchMode] = useState(false);
  const { data: watchData } = useKvWatchHistory(connectionId, bucket.bucket, watchMode);

  const keys = useMemo(() => keysData?.keys ?? [], [keysData?.keys]);

  const filteredKeys = useMemo(() => {
    if (!searchQuery.trim()) return keys;
    const q = searchQuery.toLowerCase();
    return keys.filter((key) => key.toLowerCase().includes(q));
  }, [keys, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const pagedKeys = filteredKeys.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const toggleSelectKey = (name: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAllKeys = () => {
    if (!filteredKeys.length) return;
    setSelectedKeys((prev) =>
      prev.size === filteredKeys.length ? new Set() : new Set(filteredKeys),
    );
  };

  const handleBulkDeleteKeys = async () => {
    if (selectedKeys.size === 0) return;
    const names = Array.from(selectedKeys);
    const confirmed = window.confirm(
      `Dry run preview:\n${names.slice(0, 10).join('\n')}\n\nDelete ${names.length} key(s)?`,
    );
    if (!confirmed) return;
    const guard = window.prompt('Type DELETE to confirm bulk deletion:');
    if (guard !== 'DELETE') return;
    for (const name of names) {
      try {
        await deleteEntry.mutateAsync(name);
      } catch (error) {
        console.error('Bulk delete failed for', name, error);
      }
    }
    setSelectedKeys(new Set());
  };

  const handlePut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPutError(null);
    const key = putForm.key.trim();
    if (!key) {
      setPutError('Key is required.');
      return;
    }
    try {
      await putEntry.mutateAsync({ key, value: putForm.value });
      setPutForm({ key: '', value: '' });
      setShowPutForm(false);
      toast.success(`Key "${key}" saved.`);
    } catch (err) {
      setPutError(err instanceof Error ? err.message : 'Failed to put key');
    }
  };

  const handleDelete = async (key: string) => {
    if (confirm(`Delete key "${key}"?`)) {
      try {
        await deleteEntry.mutateAsync(key);
        if (selectedKey === key) setSelectedKey(null);
        toast.success(`Key "${key}" deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete key');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold mb-1">{bucket.bucket}</h1>
            <p className="text-muted-foreground">
              {formatNumber(bucket.values)} keys &middot; {formatBytes(bucket.size)} &middot;
              History: {bucket.history} &middot;{' '}
              <Badge variant="outline" className="rounded-md">
                {bucket.storage}
              </Badge>
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant={watchMode ? 'default' : 'outline'}
            onClick={() => setWatchMode(!watchMode)}
          >
            <Radio className="w-4 h-4" />
            {watchMode ? 'Watching...' : 'Watch'}
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowPutForm(true)}>
            <Plus className="w-4 h-4" />
            Put Key
          </Button>
          {selectedKeys.size > 0 && (
            <Button variant="destructive" onClick={handleBulkDeleteKeys}>
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedKeys.size})
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showPutForm} onOpenChange={setShowPutForm}>
        <DialogHeader onClose={() => setShowPutForm(false)}>
          <DialogTitle>Put Key</DialogTitle>
          <DialogDescription>Set a key-value pair in this KV store.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handlePut}>
          <DialogContent>
            <div className="space-y-4">
              <label className="space-y-1 block">
                <Label>Key</Label>
                <Input
                  value={putForm.key}
                  onChange={(e) => setPutForm((prev) => ({ ...prev, key: e.target.value }))}
                  placeholder="my.key"
                />
              </label>
              <label className="space-y-1 block">
                <Label>Value</Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={putForm.value}
                  onChange={(e) => setPutForm((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder='{"example": "value"}'
                />
              </label>
              {putError && <p className="text-sm text-destructive">{putError}</p>}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPutForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={putEntry.isPending}>
              {putEntry.isPending ? 'Saving...' : 'Put Key'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Input
        placeholder="Filter keys..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          {isLoading ? (
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading keys...
            </CardContent>
          ) : filteredKeys.length > 0 ? (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filteredKeys.length > 0 && selectedKeys.size === filteredKeys.length
                        }
                        onChange={toggleSelectAllKeys}
                      />
                    </TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedKeys.map((key) => (
                    <TableRow
                      key={key}
                      className={selectedKey === key ? 'bg-accent' : 'cursor-pointer'}
                      onClick={() => setSelectedKey(key)}
                    >
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedKeys.has(key)}
                          onChange={() => toggleSelectKey(key)}
                        />
                      </TableCell>
                      <TableCell className="font-medium font-mono text-sm">{key}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKey(key);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(key);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                pageIndex={pageIndex}
                pageCount={Math.ceil(filteredKeys.length / pageSize)}
                pageSize={pageSize}
                onPageChange={setPageIndex}
                onPageSizeChange={setPageSize}
                totalItems={filteredKeys.length}
              />
            </CardContent>
          ) : (
            <CardContent className="p-8 text-center text-muted-foreground">
              No keys in this bucket
            </CardContent>
          )}
        </Card>

        {selectedKey && entryData && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold font-mono text-sm">{entryData.key}</h3>
                <Badge variant="outline" className="rounded-md">
                  rev {entryData.revision}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Created: {new Date(entryData.created).toLocaleString()} &middot; Size:{' '}
                {formatBytes(entryData.length)}
              </div>
              <pre className="bg-muted p-3 rounded-md text-sm overflow-auto max-h-96 whitespace-pre-wrap break-all">
                {entryData.value}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>

      {watchMode && watchData && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary animate-pulse" />
                Live History ({watchData.total} events)
              </h3>
            </div>
            <div className="max-h-64 overflow-auto divide-y">
              {watchData.entries
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div key={`${entry.key}-${entry.revision}-${i}`} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">{entry.key}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge
                          variant={entry.operation === 'PUT' ? 'default' : 'destructive'}
                          className="rounded-md text-xs"
                        >
                          {entry.operation}
                        </Badge>
                        <span>rev {entry.revision}</span>
                        <span>{new Date(entry.created).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    {entry.operation === 'PUT' && entry.value && (
                      <pre className="text-xs text-muted-foreground mt-1 truncate max-w-full">
                        {entry.value.length > 200 ? entry.value.slice(0, 200) + '...' : entry.value}
                      </pre>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function KvPage() {
  const { connectionId } = useConnection();
  const { data: kvData, isLoading, refetch } = useKvStores(connectionId);
  const createKv = useCreateKvStore(connectionId);
  const deleteKv = useDeleteKvStore(connectionId);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<KvStoreStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredKvStores = useMemo(() => {
    const items = kvData?.kv_stores ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (kv) =>
        kv.bucket.toLowerCase().includes(q) ||
        (kv.description && kv.description.toLowerCase().includes(q)),
    );
  }, [kvData?.kv_stores, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    storage: 'file' as 'file' | 'memory',
    history: '1',
    replicas: '1',
  });

  const handleDelete = async (bucket: string) => {
    if (confirm(`Are you sure you want to destroy KV bucket "${bucket}"? This deletes all data.`)) {
      try {
        await deleteKv.mutateAsync(bucket);
        toast.success(`KV bucket "${bucket}" destroyed.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete KV bucket');
      }
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const name = createForm.name.trim();
    if (!name) {
      setCreateError('Bucket name is required.');
      return;
    }

    try {
      await createKv.mutateAsync({
        name,
        description: createForm.description.trim() || undefined,
        storage: createForm.storage,
        history: parseInt(createForm.history) || 1,
        replicas: parseInt(createForm.replicas) || 1,
      });
      setCreateForm({ name: '', description: '', storage: 'file', history: '1', replicas: '1' });
      setShowCreateForm(false);
      toast.success(`KV bucket "${name}" created.`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create KV bucket');
    }
  };

  if (selectedBucket && connectionId) {
    return (
      <KvKeyBrowser
        connectionId={connectionId}
        bucket={selectedBucket}
        onBack={() => setSelectedBucket(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">KV Stores</h1>
          <p className="text-muted-foreground">Manage JetStream Key-Value stores</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4" />
            Create KV Store
          </Button>
        </div>
      </div>

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogHeader onClose={() => setShowCreateForm(false)}>
          <DialogTitle>Create KV Store</DialogTitle>
          <DialogDescription>Create a new JetStream Key-Value store.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate}>
          <DialogContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="my-config"
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
                <Label>Description (optional)</Label>
                <Input
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Application configuration"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>History (versions per key)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={createForm.history}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, history: e.target.value }))
                    }
                  />
                </label>
                <label className="space-y-1">
                  <Label>Replicas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={createForm.replicas}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, replicas: e.target.value }))
                    }
                  />
                </label>
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createKv.isPending}>
              {createKv.isPending ? 'Creating...' : 'Create KV Store'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Input
        placeholder="Filter KV stores..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        {isLoading ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading KV stores...
          </CardContent>
        ) : filteredKvStores.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>History</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Replicas</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKvStores
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((kv) => (
                    <TableRow
                      key={kv.bucket}
                      className="cursor-pointer"
                      onClick={() => setSelectedBucket(kv)}
                    >
                      <TableCell className="font-medium">{kv.bucket}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {kv.description || '-'}
                      </TableCell>
                      <TableCell>{formatNumber(kv.values)}</TableCell>
                      <TableCell>{formatBytes(kv.size)}</TableCell>
                      <TableCell>{kv.history}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-md">
                          {kv.storage}
                        </Badge>
                      </TableCell>
                      <TableCell>{kv.replicas}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(kv.bucket);
                          }}
                          variant="ghost"
                          size="icon"
                          disabled={deleteKv.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <Pagination
              pageIndex={pageIndex}
              pageCount={Math.ceil(filteredKvStores.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={filteredKvStores.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No KV stores found</p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              Create Your First KV Store
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
