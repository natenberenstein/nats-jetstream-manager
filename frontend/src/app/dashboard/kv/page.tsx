'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { KV_FIELD_HELP } from '@/lib/field-help';
import { KvStoreStatus } from '@/lib/types';
import {
  ArrowLeft,
  Database,
  Eye,
  HardDrive,
  History,
  KeyRound,
  Layers,
  Plus,
  Radio,
  Trash2,
} from 'lucide-react';
import { cn, formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Spinner } from '@/components/ui/spinner';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { BulkDeleteDialog } from '@/components/ui/bulk-delete-dialog';
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
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Pagination } from '@/components/ui/pagination';

function storageBadgeClass(storage?: string) {
  return storage === 'memory'
    ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
    : 'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300';
}

function KvKeyBrowser({
  connectionId,
  bucket,
  onBack,
}: {
  connectionId: string;
  bucket: KvStoreStatus;
  onBack: () => void;
}) {
  const {
    data: keysData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useKvKeys(connectionId, bucket.bucket);
  const putEntry = usePutKvEntry(connectionId, bucket.bucket);
  const deleteEntry = useDeleteKvEntry(connectionId, bucket.bucket);
  const confirm = useConfirm();
  const [bulkOpen, setBulkOpen] = useState(false);
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

  const handleBulkDeleteKeys = () => {
    if (selectedKeys.size === 0) return;
    setBulkOpen(true);
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
    const ok = await confirm({
      title: 'Delete key',
      description: (
        <>
          Delete key <span className="font-mono font-semibold">{key}</span> from bucket{' '}
          <span className="font-mono font-semibold">{bucket.bucket}</span>?
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Delete key',
    });
    if (!ok) return;
    try {
      await deleteEntry.mutateAsync(key);
      if (selectedKey === key) setSelectedKey(null);
      toast.success(`Key "${key}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete key');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={bucket.bucket}
        description={`${formatNumber(bucket.values)} keys · ${formatBytes(bucket.size)} · history ${bucket.history} · ${bucket.storage}`}
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <Button variant="outline" size="icon" onClick={onBack} title="Back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Button
              variant={watchMode ? 'default' : 'outline'}
              onClick={() => setWatchMode(!watchMode)}
            >
              <Radio className="w-4 h-4" />
              {watchMode ? 'Watching' : 'Watch'}
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
          </>
        }
      />

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Delete selected keys"
        description={
          <>
            From bucket <span className="font-mono font-semibold">{bucket.bucket}</span>.
          </>
        }
        items={Array.from(selectedKeys)}
        onDeleteItem={(name) => deleteEntry.mutateAsync(name).then(() => undefined)}
        onFinished={({ succeeded, failed }) => {
          if (succeeded) toast.success(`Deleted ${succeeded} key${succeeded === 1 ? '' : 's'}.`);
          if (failed.length) toast.error(`${failed.length} failed: ${failed.join(', ')}`);
          setSelectedKeys(new Set());
        }}
      />

      <Dialog open={showPutForm} onOpenChange={setShowPutForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put Key</DialogTitle>
            <DialogDescription>Set a key-value pair in this KV store.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePut} className="space-y-4">
            <div className="space-y-1">
              <FieldLabel htmlFor="put-key" help={KV_FIELD_HELP.key}>
                Key
              </FieldLabel>
              <Input
                id="put-key"
                value={putForm.key}
                onChange={(e) => setPutForm((prev) => ({ ...prev, key: e.target.value }))}
                placeholder="my.key"
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="put-value" help={KV_FIELD_HELP.value}>
                Value
              </FieldLabel>
              <Textarea
                id="put-value"
                className="min-h-[120px]"
                value={putForm.value}
                onChange={(e) => setPutForm((prev) => ({ ...prev, value: e.target.value }))}
                placeholder='{"example": "value"}'
              />
            </div>
            {putError && <p className="text-sm text-destructive">{putError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPutForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={putEntry.isPending}>
                {putEntry.isPending && <Spinner />}
                {putEntry.isPending ? 'Saving…' : 'Put Key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
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
            <CardContent className="p-0">
              <TableSkeleton rows={6} columns={3} />
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
                        onCheckedChange={toggleSelectAllKeys}
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
                      className={cn(
                        'cursor-pointer border-l-4',
                        selectedKey === key ? 'border-l-primary bg-accent' : 'border-l-transparent',
                      )}
                      onClick={() => setSelectedKey(key)}
                    >
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedKeys.has(key)}
                          onCheckedChange={() => toggleSelectKey(key)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-green-200 bg-green-100 font-mono text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                          title={key}
                        >
                          <KeyRound className="h-3 w-3" />
                          <span className="max-w-[240px] truncate">{key}</span>
                        </Badge>
                      </TableCell>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketFromQuery = searchParams.get('bucket');
  const { connectionId } = useConnection();
  const { data: kvData, isLoading, isFetching, dataUpdatedAt, refetch } = useKvStores(connectionId);
  const createKv = useCreateKvStore(connectionId);
  const deleteKv = useDeleteKvStore(connectionId);
  const confirm = useConfirm();

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

  useEffect(() => {
    if (!bucketFromQuery) return;
    const match = kvData?.kv_stores.find((kv) => kv.bucket === bucketFromQuery);
    if (match && selectedBucket !== match) {
      setSelectedBucket(match);
    }
  }, [bucketFromQuery, kvData?.kv_stores, selectedBucket]);

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    storage: 'file' as 'file' | 'memory',
    history: '1',
    replicas: '1',
  });

  const handleDelete = async (bucket: string) => {
    const ok = await confirm({
      title: 'Destroy KV bucket',
      description: (
        <>
          Permanently destroy bucket <span className="font-mono font-semibold">{bucket}</span>? All
          keys and history will be lost.
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Destroy bucket',
    });
    if (!ok) return;
    try {
      await deleteKv.mutateAsync(bucket);
      toast.success(`KV bucket "${bucket}" destroyed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete KV bucket');
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

  const openBucket = (bucket: KvStoreStatus) => {
    setSelectedBucket(bucket);
    router.replace(`/dashboard/kv?bucket=${encodeURIComponent(bucket.bucket)}`);
  };

  const closeBucket = () => {
    setSelectedBucket(null);
    router.replace('/dashboard/kv');
  };

  if (selectedBucket && connectionId) {
    return (
      <KvKeyBrowser connectionId={connectionId} bucket={selectedBucket} onBack={closeBucket} />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="KV Stores"
        description="Manage JetStream Key-Value stores"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4" />
            Create KV Store
          </Button>
        }
      />

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create KV Store</DialogTitle>
            <DialogDescription>Create a new JetStream Key-Value store.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <FieldLabel htmlFor="kv-name" help={KV_FIELD_HELP.name}>
                  Name
                </FieldLabel>
                <Input
                  id="kv-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="my-config"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="kv-storage" help={KV_FIELD_HELP.storage}>
                  Storage
                </FieldLabel>
                <Select
                  value={createForm.storage}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      storage: value as 'file' | 'memory',
                    }))
                  }
                >
                  <SelectTrigger id="kv-storage">
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
              <FieldLabel htmlFor="kv-description" help={KV_FIELD_HELP.description}>
                Description (optional)
              </FieldLabel>
              <Input
                id="kv-description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Application configuration"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <FieldLabel htmlFor="kv-history" help={KV_FIELD_HELP.history}>
                  History (versions per key)
                </FieldLabel>
                <Input
                  id="kv-history"
                  type="number"
                  min={1}
                  value={createForm.history}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, history: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="kv-replicas" help={KV_FIELD_HELP.replicas}>
                  Replicas
                </FieldLabel>
                <Input
                  id="kv-replicas"
                  type="number"
                  min={1}
                  value={createForm.replicas}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, replicas: e.target.value }))}
                />
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createKv.isPending}>
                {createKv.isPending && <Spinner />}
                {createKv.isPending ? 'Creating…' : 'Create KV Store'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Input
        placeholder="Filter KV stores..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={5} columns={7} />
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
                      onClick={() => openBucket(kv)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="gap-1 rounded-md border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                            title={kv.bucket}
                          >
                            <KeyRound className="h-3 w-3" />
                            <span className="max-w-[180px] truncate">{kv.bucket}</span>
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {kv.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                        >
                          <KeyRound className="h-3 w-3" />
                          {formatNumber(kv.values)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300"
                        >
                          <HardDrive className="h-3 w-3" />
                          {formatBytes(kv.size)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 rounded-md">
                          <History className="h-3 w-3" />
                          {kv.history}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('gap-1 rounded-md', storageBadgeClass(kv.storage))}
                        >
                          {kv.storage === 'memory' ? (
                            <Database className="h-3 w-3" />
                          ) : (
                            <HardDrive className="h-3 w-3" />
                          )}
                          {kv.storage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 rounded-md">
                          <Layers className="h-3 w-3" />
                          {kv.replicas}
                        </Badge>
                      </TableCell>
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
