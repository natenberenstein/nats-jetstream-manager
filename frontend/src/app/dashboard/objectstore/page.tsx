'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useConnection } from '@/contexts/ConnectionContext';
import {
  useObjectStores,
  useCreateObjectStore,
  useDeleteObjectStore,
  useObjectList,
  usePutObject,
  useDeleteObject,
} from '@/hooks/useObjectStore';
import { objectStoreApi } from '@/lib/api';
import { ObjectStoreStatusInfo } from '@/lib/types';
import {
  ArrowLeft,
  Database,
  Download,
  File,
  HardDrive,
  Layers,
  Lock,
  Package,
  Plus,
  Trash2,
  Unlock,
  Upload,
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

function storageBadgeClass(storage?: string) {
  return storage === 'memory'
    ? 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300'
    : 'border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300';
}

function ObjectBrowser({
  connectionId,
  store,
  onBack,
}: {
  connectionId: string;
  store: ObjectStoreStatusInfo;
  onBack: () => void;
}) {
  const {
    data: objectsData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useObjectList(connectionId, store.bucket);
  const putObject = usePutObject(connectionId, store.bucket);
  const deleteObject = useDeleteObject(connectionId, store.bucket);
  const confirm = useConfirm();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', description: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());

  const objects = useMemo(() => objectsData?.objects ?? [], [objectsData?.objects]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredObjects = useMemo(() => {
    if (!searchQuery.trim()) return objects;
    const q = searchQuery.toLowerCase();
    return objects.filter(
      (obj) =>
        obj.name.toLowerCase().includes(q) ||
        (obj.description && obj.description.toLowerCase().includes(q)),
    );
  }, [objects, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const pagedObjects = filteredObjects.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const toggleSelectObject = (name: string) => {
    setSelectedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAllObjects = () => {
    if (!objects.length) return;
    setSelectedObjects((prev) =>
      prev.size === objects.length ? new Set() : new Set(objects.map((o) => o.name)),
    );
  };

  const handleBulkDeleteObjects = () => {
    if (selectedObjects.size === 0) return;
    setBulkOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!uploadForm.name) {
      setUploadForm((prev) => ({ ...prev, name: file.name }));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      setFileData(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError(null);

    const name = uploadForm.name.trim();
    if (!name) {
      setUploadError('Object name is required.');
      return;
    }
    if (!fileData) {
      setUploadError('Please select a file.');
      return;
    }

    try {
      await putObject.mutateAsync({
        name,
        data: fileData,
        description: uploadForm.description.trim() || undefined,
      });
      setUploadForm({ name: '', description: '' });
      setFileData(null);
      setFileName('');
      setShowUploadForm(false);
      toast.success(`Object "${name}" uploaded.`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload object');
    }
  };

  const handleDownload = async (name: string) => {
    try {
      const result = await objectStoreApi.getObjectData(connectionId, store.bucket, name);
      const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download object');
    }
  };

  const handleDelete = async (name: string) => {
    const ok = await confirm({
      title: 'Delete object',
      description: (
        <>
          Delete object <span className="font-mono font-semibold">{name}</span> from{' '}
          <span className="font-mono font-semibold">{store.bucket}</span>?
        </>
      ),
      tone: 'destructive',
      confirmLabel: 'Delete object',
    });
    if (!ok) return;
    try {
      await deleteObject.mutateAsync(name);
      toast.success(`Object "${name}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete object');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={store.bucket}
        description={`${formatBytes(store.size)} · ${store.storage}${store.sealed ? ' · sealed' : ''}`}
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
            <Button onClick={() => setShowUploadForm(true)} disabled={store.sealed}>
              <Upload className="w-4 h-4" />
              Upload Object
            </Button>
            {selectedObjects.size > 0 && (
              <Button variant="destructive" onClick={handleBulkDeleteObjects}>
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedObjects.size})
              </Button>
            )}
          </>
        }
      />

      <BulkDeleteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Delete selected objects"
        description={
          <>
            From object store <span className="font-mono font-semibold">{store.bucket}</span>.
          </>
        }
        items={Array.from(selectedObjects)}
        onDeleteItem={(name) => deleteObject.mutateAsync(name).then(() => undefined)}
        onFinished={({ succeeded, failed }) => {
          if (succeeded) toast.success(`Deleted ${succeeded} object${succeeded === 1 ? '' : 's'}.`);
          if (failed.length) toast.error(`${failed.length} failed: ${failed.join(', ')}`);
          setSelectedObjects(new Set());
        }}
      />

      <Dialog open={showUploadForm} onOpenChange={setShowUploadForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Object</DialogTitle>
            <DialogDescription>Upload a file to this object store.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="upload-file">File</Label>
              <Input id="upload-file" ref={fileInputRef} type="file" onChange={handleFileSelect} />
              {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="upload-name">Object Name</Label>
              <Input
                id="upload-name"
                value={uploadForm.name}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="report.pdf"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="upload-description">Description (optional)</Label>
              <Input
                id="upload-description"
                value={uploadForm.description}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Monthly report"
              />
            </div>
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowUploadForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={putObject.isPending}>
                {putObject.isPending && <Spinner />}
                {putObject.isPending ? 'Uploading…' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Input
        placeholder="Filter objects..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={5} columns={6} />
          </CardContent>
        ) : filteredObjects.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={objects.length > 0 && selectedObjects.size === objects.length}
                      onCheckedChange={toggleSelectAllObjects}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedObjects.map((obj) => (
                  <TableRow key={obj.nuid}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedObjects.has(obj.name)}
                        onCheckedChange={() => toggleSelectObject(obj.name)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-md border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                        title={obj.name}
                      >
                        <File className="h-3 w-3" />
                        <span className="max-w-[220px] truncate">{obj.name}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {obj.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-md border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300"
                      >
                        <HardDrive className="h-3 w-3" />
                        {formatBytes(obj.size)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 rounded-md">
                        <Layers className="h-3 w-3" />
                        {formatNumber(obj.chunks)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(obj.mtime).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(obj.name)}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(obj.name)}
                        disabled={deleteObject.isPending}
                        title="Delete"
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
              pageCount={Math.ceil(filteredObjects.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={filteredObjects.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center text-muted-foreground">
            No objects in this store
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function ObjectStorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucketFromQuery = searchParams.get('bucket');
  const { connectionId } = useConnection();
  const {
    data: storeData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useObjectStores(connectionId);
  const createStore = useCreateObjectStore(connectionId);
  const deleteStore = useDeleteObjectStore(connectionId);
  const confirm = useConfirm();

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<ObjectStoreStatusInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStores = useMemo(() => {
    const items = storeData?.object_stores ?? [];
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (s) =>
        s.bucket.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)),
    );
  }, [storeData?.object_stores, searchQuery]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!bucketFromQuery) return;
    const match = storeData?.object_stores.find((store) => store.bucket === bucketFromQuery);
    if (match && selectedStore !== match) {
      setSelectedStore(match);
    }
  }, [bucketFromQuery, selectedStore, storeData?.object_stores]);

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    storage: 'file' as 'file' | 'memory',
    replicas: '1',
  });

  const handleDelete = async (bucket: string) => {
    const ok = await confirm({
      title: `Destroy object store "${bucket}"?`,
      description: 'This permanently deletes the bucket and all objects within it.',
      confirmLabel: 'Destroy',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteStore.mutateAsync(bucket);
      toast.success(`Object store "${bucket}" destroyed.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete object store');
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const name = createForm.name.trim();
    if (!name) {
      setCreateError('Store name is required.');
      return;
    }

    try {
      await createStore.mutateAsync({
        name,
        description: createForm.description.trim() || undefined,
        storage: createForm.storage,
        replicas: parseInt(createForm.replicas) || 1,
      });
      setCreateForm({ name: '', description: '', storage: 'file', replicas: '1' });
      setShowCreateForm(false);
      toast.success(`Object store "${name}" created.`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create object store');
    }
  };

  const openStore = (store: ObjectStoreStatusInfo) => {
    setSelectedStore(store);
    router.replace(`/dashboard/objectstore?bucket=${encodeURIComponent(store.bucket)}`);
  };

  const closeStore = () => {
    setSelectedStore(null);
    router.replace('/dashboard/objectstore');
  };

  if (selectedStore && connectionId) {
    return <ObjectBrowser connectionId={connectionId} store={selectedStore} onBack={closeStore} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Object Stores"
        description="Manage JetStream Object stores"
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
            Create Object Store
          </Button>
        }
      />

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Object Store</DialogTitle>
            <DialogDescription>Create a new JetStream Object store.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="os-name">Name</Label>
                <Input
                  id="os-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="documents"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="os-storage">Storage</Label>
                <Select
                  value={createForm.storage}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      storage: value as 'file' | 'memory',
                    }))
                  }
                >
                  <SelectTrigger id="os-storage">
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
              <Label htmlFor="os-description">Description (optional)</Label>
              <Input
                id="os-description"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Document storage"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="os-replicas">Replicas</Label>
              <Input
                id="os-replicas"
                type="number"
                min={1}
                value={createForm.replicas}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, replicas: e.target.value }))}
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStore.isPending}>
                {createStore.isPending && <Spinner />}
                {createStore.isPending ? 'Creating…' : 'Create Object Store'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Input
        placeholder="Filter object stores..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={5} columns={7} />
          </CardContent>
        ) : filteredStores.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Replicas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStores
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((store) => (
                    <TableRow
                      key={store.bucket}
                      className="cursor-pointer"
                      onClick={() => openStore(store)}
                    >
                      <TableCell className="font-medium">
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                          title={store.bucket}
                        >
                          <Package className="h-3 w-3" />
                          <span className="max-w-[180px] truncate">{store.bucket}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {store.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300"
                        >
                          <HardDrive className="h-3 w-3" />
                          {formatBytes(store.size)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('gap-1 rounded-md', storageBadgeClass(store.storage))}
                        >
                          {store.storage === 'memory' ? (
                            <Database className="h-3 w-3" />
                          ) : (
                            <HardDrive className="h-3 w-3" />
                          )}
                          {store.storage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 rounded-md">
                          <Layers className="h-3 w-3" />
                          {store.replicas}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {store.sealed ? (
                          <Badge variant="warning" className="gap-1 rounded-md">
                            <Lock className="h-3 w-3" />
                            Sealed
                          </Badge>
                        ) : (
                          <Badge variant="success" className="gap-1 rounded-md">
                            <Unlock className="h-3 w-3" />
                            Open
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(store.bucket);
                          }}
                          variant="ghost"
                          size="icon"
                          disabled={deleteStore.isPending}
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
              pageCount={Math.ceil(filteredStores.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={filteredStores.length}
            />
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No object stores found</p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4" />
              Create Your First Object Store
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
