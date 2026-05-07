'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Save, Trash2, Zap, CheckCircle, XCircle } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConnectionRequest } from '@/lib/types';

const SAVED_CONNECTIONS_KEY = 'nats_saved_connections_v1';
const ACTIVE_WORKSPACE_KEY = 'nats_active_workspace_v1';

interface SavedConnection {
  name: string;
  environment: string;
  request: ConnectionRequest;
}

export default function HomePage() {
  const router = useRouter();
  const { connect, testConnection, isConnecting, error } = useConnection();

  const [formData, setFormData] = useState({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
    monitoring_url: '',
    sys_user: '',
    sys_password: '',
  });
  const [workspaceName, setWorkspaceName] = useState('Local');
  const [environment, setEnvironment] = useState('local');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    jetstream: boolean;
    error?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_CONNECTIONS_KEY);
    if (!raw) return;
    try {
      setSavedConnections(JSON.parse(raw) as SavedConnection[]);
    } catch {
      setSavedConnections([]);
    }
  }, []);

  const handleTest = async () => {
    setTestResult(null);
    setIsTesting(true);
    try {
      const result = await testConnection(formData);
      setTestResult({
        success: result.success,
        jetstream: result.jetstream_enabled,
        error: result.error,
      });
    } catch (err) {
      setTestResult({
        success: false,
        jetstream: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await connect(formData);
      localStorage.setItem(
        ACTIVE_WORKSPACE_KEY,
        JSON.stringify({ name: workspaceName.trim() || formData.url, environment }),
      );
      router.push('/dashboard');
    } catch {
      // handled by connection context
    }
  };

  const saveConnection = () => {
    const name = workspaceName.trim() || formData.url;
    const next = [
      ...savedConnections.filter((connection) => connection.name !== name),
      {
        name,
        environment: environment.trim() || 'default',
        request: formData,
      },
    ];
    setSavedConnections(next);
    localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(next));
  };

  const deleteSavedConnection = (name: string) => {
    const next = savedConnections.filter((connection) => connection.name !== name);
    setSavedConnections(next);
    localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(next));
  };

  const loadSavedConnection = (connection: SavedConnection) => {
    setWorkspaceName(connection.name);
    setEnvironment(connection.environment);
    setFormData({
      url: connection.request.url,
      user: connection.request.user || '',
      password: connection.request.password || '',
      monitoring_url: connection.request.monitoring_url || '',
      sys_user: connection.request.sys_user || '',
      sys_password: connection.request.sys_password || '',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/40 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Database className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-2">NATS JetStream Manager</h1>
          <p className="text-muted-foreground">Connect to your NATS cluster to get started</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">Connection</CardTitle>
            <CardDescription>Enter your NATS server details and connect</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-6">
              <div>
                <Label htmlFor="workspace-name" className="mb-2 block">
                  Workspace Name
                </Label>
                <Input
                  id="workspace-name"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Local"
                />
              </div>

              <div>
                <Label htmlFor="environment" className="mb-2 block">
                  Environment
                </Label>
                <Input
                  id="environment"
                  type="text"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="local"
                />
              </div>

              <div>
                <Label htmlFor="url" className="mb-2 block">
                  NATS Server URL
                </Label>
                <Input
                  id="url"
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="nats://localhost:4222"
                  required
                />
              </div>

              <div>
                <Label htmlFor="user" className="mb-2 block">
                  Username (Optional)
                </Label>
                <Input
                  id="user"
                  type="text"
                  value={formData.user}
                  onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                  placeholder="username"
                />
              </div>

              <div>
                <Label htmlFor="password" className="mb-2 block">
                  Password (Optional)
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="password"
                />
              </div>

              <div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                >
                  {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
                </Button>
              </div>

              {showAdvanced && (
                <div className="space-y-4 rounded border p-4">
                  <p className="text-xs text-muted-foreground">
                    For full cluster visibility (all peer node names). Provide either a monitoring
                    URL, or $SYS account credentials, or both.
                  </p>
                  <div>
                    <Label htmlFor="monitoring_url" className="mb-2 block">
                      Monitoring URL (Optional)
                    </Label>
                    <Input
                      id="monitoring_url"
                      type="text"
                      value={formData.monitoring_url}
                      onChange={(e) => setFormData({ ...formData, monitoring_url: e.target.value })}
                      placeholder="http://localhost:8222"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sys_user" className="mb-2 block">
                      $SYS Username (Optional)
                    </Label>
                    <Input
                      id="sys_user"
                      type="text"
                      value={formData.sys_user}
                      onChange={(e) => setFormData({ ...formData, sys_user: e.target.value })}
                      placeholder="sys"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sys_password" className="mb-2 block">
                      $SYS Password (Optional)
                    </Label>
                    <Input
                      id="sys_password"
                      type="password"
                      value={formData.sys_password}
                      onChange={(e) => setFormData({ ...formData, sys_password: e.target.value })}
                      placeholder="password"
                    />
                  </div>
                </div>
              )}

              {testResult && (
                <Alert variant={testResult.success ? 'success' : 'destructive'}>
                  {testResult.success ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <AlertTitle>Connection successful</AlertTitle>
                      <AlertDescription>
                        Connected! JetStream: {testResult.jetstream ? 'Enabled' : 'Disabled'}
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      <AlertTitle>Connection failed</AlertTitle>
                      <AlertDescription>
                        {testResult.error || 'Check URL and credentials.'}
                      </AlertDescription>
                    </>
                  )}
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <XCircle className="w-5 h-5" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveConnection}
                  disabled={!formData.url.trim()}
                >
                  <Save className="w-4 h-4" />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTest}
                  disabled={isConnecting || isTesting}
                  className="flex-1"
                >
                  {isTesting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
                <Button type="submit" disabled={isConnecting} className="flex-1">
                  {isConnecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {savedConnections.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Saved Workspaces</CardTitle>
              <CardDescription>Quickly reconnect to known clusters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedConnections.map((connection) => (
                <div
                  key={connection.name}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{connection.name}</p>
                      <Badge variant="outline">{connection.environment}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.request.url}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => loadSavedConnection(connection)}
                    >
                      Load
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSavedConnection(connection.name)}
                      title="Delete saved workspace"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
