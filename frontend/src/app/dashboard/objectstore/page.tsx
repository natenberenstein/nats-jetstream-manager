'use client';

import { useState, useRef } from 'react';
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
import { Plus, Trash2, RefreshCw, ArrowLeft, Download, Upload } from 'lucide-react';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

function ObjectBrowser({
  connectionId,
  store,
  onBack,
}: {
  connectionId: string;
  store: ObjectStoreStatusInfo;
  onBack: () => void;
}) {
  const { data: objectsData, isLoading, refetch } = useObjectList(connectionId, store.bucket);
  const putObject = usePutObject(connectionId, store.bucket);
  const deleteObject = useDeleteObject(connectionId, store.bucket);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', description: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

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
    if (confirm(`Delete object "${name}"?`)) {
      try {
        await deleteObject.mutateAsync(name);
        toast.success(`Object "${name}" deleted.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete object');
      }
    }
  };

  const objects = objectsData?.objects ?? [];
  const pagedObjects = objects.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold mb-1">{store.bucket}</h1>
            <p className="text-muted-foreground">
              {formatBytes(store.size)} &middot;{' '}
              <Badge variant="outline" className="rounded-md">
                {store.storage}
              </Badge>
              {store.sealed && (
                <Badge variant="secondary" className="ml-2 rounded-md">
                  Sealed
                </Badge>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowUploadForm(true)} disabled={store.sealed}>
            <Upload className="w-4 h-4" />
            Upload Object
          </Button>
        </div>
      </div>

      <Dialog open={showUploadForm} onOpenChange={setShowUploadForm}>
        <DialogHeader onClose={() => setShowUploadForm(false)}>
          <DialogTitle>Upload Object</DialogTitle>
          <DialogDescription>Upload a file to this object store.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUpload}>
          <DialogContent>
            <div className="space-y-4">
              <label className="space-y-1 block">
                <Label>File</Label>
                <Input ref={fileInputRef} type="file" onChange={handleFileSelect} />
                {fileName && <p className="text-xs text-muted-foreground">Selected: {fileName}</p>}
              </label>
              <label className="space-y-1 block">
                <Label>Object Name</Label>
                <Input
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="report.pdf"
                />
              </label>
              <label className="space-y-1 block">
                <Label>Description (optional)</Label>
                <Input
                  value={uploadForm.description}
                  onChange={(e) =>
                    setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Monthly report"
                />
              </label>
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowUploadForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={putObject.isPending}>
              {putObject.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Card>
        {isLoading ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading objects...
          </CardContent>
        ) : objects.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell className="font-medium">{obj.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {obj.description || '-'}
                    </TableCell>
                    <TableCell>{formatBytes(obj.size)}</TableCell>
                    <TableCell>{formatNumber(obj.chunks)}</TableCell>
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
              pageCount={Math.ceil(objects.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={objects.length}
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
  const { connectionId } = useConnection();
  const { data: storeData, isLoading, refetch } = useObjectStores(connectionId);
  const createStore = useCreateObjectStore(connectionId);
  const deleteStore = useDeleteObjectStore(connectionId);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<ObjectStoreStatusInfo | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    storage: 'file' as 'file' | 'memory',
    replicas: '1',
  });

  const handleDelete = async (bucket: string) => {
    if (
      confirm(`Are you sure you want to destroy object store "${bucket}"? This deletes all data.`)
    ) {
      try {
        await deleteStore.mutateAsync(bucket);
        toast.success(`Object store "${bucket}" destroyed.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete object store');
      }
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

  if (selectedStore && connectionId) {
    return (
      <ObjectBrowser
        connectionId={connectionId}
        store={selectedStore}
        onBack={() => setSelectedStore(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Object Stores</h1>
          <p className="text-muted-foreground">Manage JetStream Object stores</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4" />
            Create Object Store
          </Button>
        </div>
      </div>

      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogHeader onClose={() => setShowCreateForm(false)}>
          <DialogTitle>Create Object Store</DialogTitle>
          <DialogDescription>Create a new JetStream Object store.</DialogDescription>
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
                    placeholder="documents"
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
                  placeholder="Document storage"
                />
              </label>
              <label className="space-y-1 block">
                <Label>Replicas</Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.replicas}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, replicas: e.target.value }))}
                />
              </label>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createStore.isPending}>
              {createStore.isPending ? 'Creating...' : 'Create Object Store'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Card>
        {isLoading ? (
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading object stores...
          </CardContent>
        ) : storeData?.object_stores && storeData.object_stores.length > 0 ? (
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
                {storeData.object_stores
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((store) => (
                    <TableRow
                      key={store.bucket}
                      className="cursor-pointer"
                      onClick={() => setSelectedStore(store)}
                    >
                      <TableCell className="font-medium">{store.bucket}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {store.description || '-'}
                      </TableCell>
                      <TableCell>{formatBytes(store.size)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-md">
                          {store.storage}
                        </Badge>
                      </TableCell>
                      <TableCell>{store.replicas}</TableCell>
                      <TableCell>
                        {store.sealed ? (
                          <Badge variant="secondary" className="rounded-md">
                            Sealed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-md">
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
              pageCount={Math.ceil(storeData.object_stores.length / pageSize)}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={storeData.object_stores.length}
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
