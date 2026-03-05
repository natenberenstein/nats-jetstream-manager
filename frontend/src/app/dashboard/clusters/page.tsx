'use client';

import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { ConnectionRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const [form, setForm] = useState<ConnectionRequest>({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
  });
  const [clusterName, setClusterName] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Record<string, string>>({});

  const active = useMemo(
    () => connections.find((c) => c.connectionId === connectionId) || null,
    [connections, connectionId]
  );

  const onConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);
    try {
      await connect(form, { name: clusterName || undefined, makeActive: true });
      setClusterName('');
      setResult('Cluster connection added.');
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to connect cluster');
    }
  };

  const onTest = async () => {
    setResult(null);
    try {
      const test = await testConnection(form);
      setResult(test.success ? `Connection OK (JetStream: ${test.jetstream_enabled ? 'enabled' : 'disabled'})` : `Connection failed: ${test.error || 'Unknown error'}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const onRename = (id: string) => {
    const nextName = (renaming[id] || '').trim();
    if (!nextName) return;
    renameConnection(id, nextName);
    setRenaming((prev) => ({ ...prev, [id]: '' }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">Clusters</h1>
          <p className="text-muted-foreground">Manage multiple active NATS cluster connections and switch between them.</p>
        </div>
        <Button variant="outline" onClick={() => refreshConnections()}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Cluster Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onConnect} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <Label>Display Name</Label>
              <Input value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder="prod-us-east" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>URL</Label>
              <Input value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="nats://localhost:4222" required />
            </div>
            <div className="space-y-1">
              <Label>User</Label>
              <Input value={form.user || ''} onChange={(e) => setForm((p) => ({ ...p, user: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={form.password || ''} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="button" variant="outline" onClick={onTest} disabled={isConnecting}>Test</Button>
              <Button type="submit" disabled={isConnecting}>
                <Plus className="w-4 h-4" />
                Add Cluster
              </Button>
            </div>
          </form>
          {(result || error) && <p className="text-sm text-muted-foreground mt-3">{result || error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connected Clusters ({connections.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active cluster connections.</p>
          ) : (
            connections.map((conn) => (
              <div key={conn.connectionId} className="rounded border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{conn.name}{conn.connectionId === connectionId ? ' (active)' : ''}</p>
                    <p className="text-xs text-muted-foreground break-all">{conn.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {conn.connectionId !== connectionId && (
                      <Button size="sm" variant="outline" onClick={() => switchConnection(conn.connectionId)}>
                        Switch
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => disconnect(conn.connectionId)}>
                      <Trash2 className="w-4 h-4" />
                      Disconnect
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={renaming[conn.connectionId] ?? ''}
                    onChange={(e) => setRenaming((prev) => ({ ...prev, [conn.connectionId]: e.target.value }))}
                    placeholder="Rename cluster"
                  />
                  <Button size="sm" variant="outline" onClick={() => onRename(conn.connectionId)}>
                    Save Name
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  jetstream: {conn.jetstream ? 'enabled' : 'unknown'}
                  {conn.createdAt ? ` | created ${new Date(conn.createdAt).toLocaleString()}` : ''}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {active && (
        <p className="text-xs text-muted-foreground">
          Active cluster: <span className="font-medium">{active.name}</span>
        </p>
      )}
    </div>
  );
}
