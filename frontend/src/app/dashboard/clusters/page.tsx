'use client';

import { useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, ArrowRightLeft } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { ConnectionRequest } from '@/lib/types';
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

export default function ClustersPage() {
  const {
    connections,
    connectionId,
    connect,
    disconnect,
    switchConnection,
    renameConnection,
    refreshConnections,
    testConnection,
    isConnecting,
    error,
  } = useConnection();

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<ConnectionRequest>({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
  });
  const [clusterName, setClusterName] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  const resetForm = () => {
    setForm({ url: 'nats://localhost:4222', user: '', password: '' });
    setClusterName('');
    setResult(null);
  };

  const onConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);
    try {
      await connect(form, { name: clusterName || undefined, makeActive: true });
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to connect cluster');
    }
  };

  const onTest = async () => {
    setResult(null);
    try {
      const test = await testConnection(form);
      setResult(
        test.success
          ? `Connection OK (JetStream: ${test.jetstream_enabled ? 'enabled' : 'disabled'})`
          : `Connection failed: ${test.error || 'Unknown error'}`,
      );
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const openRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenamingValue(currentName);
  };

  const submitRename = () => {
    const nextName = renamingValue.trim();
    if (!nextName || !renamingId) return;
    renameConnection(renamingId, nextName);
    setRenamingId(null);
    setRenamingValue('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">Clusters</h1>
          <p className="text-muted-foreground">
            Manage multiple active NATS cluster connections and switch between them.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refreshConnections()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4" />
            Add Cluster
          </Button>
        </div>
      </div>

      {/* Add Cluster Dialog */}
      <Dialog
        open={showAddForm}
        onOpenChange={(open) => {
          setShowAddForm(open);
          if (!open) resetForm();
        }}
      >
        <DialogHeader onClose={() => setShowAddForm(false)}>
          <DialogTitle>Add Cluster Connection</DialogTitle>
          <DialogDescription>Connect to a new NATS cluster.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onConnect}>
          <DialogContent>
            <div className="space-y-4">
              <label className="space-y-1 block">
                <Label>Display Name</Label>
                <Input
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="prod-us-east"
                />
              </label>
              <label className="space-y-1 block">
                <Label>URL</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                  placeholder="nats://localhost:4222"
                  required
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <Label>User</Label>
                  <Input
                    value={form.user || ''}
                    onChange={(e) => setForm((p) => ({ ...p, user: e.target.value }))}
                  />
                </label>
                <label className="space-y-1">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={form.password || ''}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  />
                </label>
              </div>
              {(result || error) && (
                <p className="text-sm text-muted-foreground">{result || error}</p>
              )}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onTest} disabled={isConnecting}>
              Test
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Add Cluster'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renamingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingId(null);
            setRenamingValue('');
          }
        }}
      >
        <DialogHeader onClose={() => setRenamingId(null)}>
          <DialogTitle>Rename Cluster</DialogTitle>
          <DialogDescription>Set a new display name for this cluster.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <DialogContent>
            <label className="space-y-1 block">
              <Label>Display Name</Label>
              <Input
                autoFocus
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                placeholder="prod-us-east"
              />
            </label>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenamingId(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!renamingValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {/* Clusters Table */}
      <Card>
        {connections.length === 0 ? (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No active cluster connections.</p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4" />
              Add Your First Cluster
            </Button>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>JetStream</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((conn) => (
                  <TableRow key={conn.connectionId}>
                    <TableCell className="font-medium">{conn.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm break-all max-w-xs">
                      {conn.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-md">
                        {conn.jetstream ? 'enabled' : 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conn.connectionId === connectionId ? (
                        <Badge className="rounded-md">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-md">
                          Connected
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {conn.createdAt ? new Date(conn.createdAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Rename"
                        onClick={() => openRename(conn.connectionId, conn.name)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {conn.connectionId !== connectionId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Switch to this cluster"
                          onClick={() => switchConnection(conn.connectionId)}
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Disconnect"
                        onClick={() => disconnect(conn.connectionId)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
