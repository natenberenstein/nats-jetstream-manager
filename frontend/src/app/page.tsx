'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Save, Trash2, Zap, CheckCircle, XCircle } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { CONNECTION_FIELD_HELP } from '@/lib/field-help';
import { ConnectionRequest } from '@/lib/types';

const SAVED_CONNECTIONS_KEY = 'nats_saved_connections_v1';
const ACTIVE_WORKSPACE_KEY = 'nats_active_workspace_v1';

interface SavedConnection {
  name: string;
  environment: string;
  request: ConnectionRequest;
  remember_secrets?: boolean;
  created_at?: string;
  last_used_at?: string;
}

type ConnectionFormData = {
  url: string;
  user: string;
  password: string;
  token: string;
  monitoring_url: string;
  sys_user: string;
  sys_password: string;
};

function compactRequest(data: ConnectionFormData, includeSecrets: boolean): ConnectionRequest {
  return {
    url: data.url.trim(),
    user: data.user.trim() || undefined,
    password: includeSecrets ? data.password || undefined : undefined,
    token: includeSecrets ? data.token || undefined : undefined,
    monitoring_url: data.monitoring_url.trim() || undefined,
    sys_user: data.sys_user.trim() || undefined,
    sys_password: includeSecrets ? data.sys_password || undefined : undefined,
  };
}

function hasStoredSecret(connection: SavedConnection): boolean {
  return Boolean(
    connection.request.password || connection.request.token || connection.request.sys_password,
  );
}

function isProductionEnvironment(value: string): boolean {
  return /(prod|production|live)/i.test(value.trim());
}

function environmentBadgeClass(environment: string): string {
  if (isProductionEnvironment(environment)) {
    return 'border-destructive/40 bg-destructive/10 text-destructive';
  }
  if (/stage|staging|preprod/i.test(environment)) {
    return 'border-warning/40 bg-warning/10 text-warning';
  }
  if (/local|dev|test/i.test(environment)) {
    return 'border-success/40 bg-success/10 text-success';
  }
  return '';
}

export default function HomePage() {
  const router = useRouter();
  const { connect, testConnection, isConnecting, error } = useConnection();

  const [formData, setFormData] = useState({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
    token: '',
    monitoring_url: '',
    sys_user: '',
    sys_password: '',
  });
  const [workspaceName, setWorkspaceName] = useState('Local');
  const [environment, setEnvironment] = useState('local');
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rememberSecrets, setRememberSecrets] = useState(false);

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
      const result = await testConnection(compactRequest(formData, true));
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
      await connect(compactRequest(formData, true));
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
    const existing = savedConnections.find((connection) => connection.name === name);
    const now = new Date().toISOString();
    const next = [
      ...savedConnections.filter((connection) => connection.name !== name),
      {
        name,
        environment: environment.trim() || 'default',
        request: compactRequest(formData, rememberSecrets),
        remember_secrets: rememberSecrets,
        created_at: existing?.created_at ?? now,
        last_used_at: existing?.last_used_at,
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
      token: connection.request.token || '',
      monitoring_url: connection.request.monitoring_url || '',
      sys_user: connection.request.sys_user || '',
      sys_password: connection.request.sys_password || '',
    });
    setRememberSecrets(Boolean(connection.remember_secrets || hasStoredSecret(connection)));
  };

  const connectSavedConnection = async (connection: SavedConnection) => {
    loadSavedConnection(connection);
    try {
      await connect(connection.request);
      localStorage.setItem(
        ACTIVE_WORKSPACE_KEY,
        JSON.stringify({ name: connection.name, environment: connection.environment }),
      );
      const next = savedConnections.map((item) =>
        item.name === connection.name ? { ...item, last_used_at: new Date().toISOString() } : item,
      );
      setSavedConnections(next);
      localStorage.setItem(SAVED_CONNECTIONS_KEY, JSON.stringify(next));
      router.push('/dashboard');
    } catch {
      // handled by connection context
    }
  };

  const productionProfile = isProductionEnvironment(environment);

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
                <FieldLabel
                  htmlFor="workspace-name"
                  help={CONNECTION_FIELD_HELP.workspaceName}
                  containerClassName="mb-2"
                >
                  Workspace Name
                </FieldLabel>
                <Input
                  id="workspace-name"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Local"
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor="environment"
                  help={CONNECTION_FIELD_HELP.environment}
                  containerClassName="mb-2"
                >
                  Environment
                </FieldLabel>
                <Input
                  id="environment"
                  type="text"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  placeholder="local"
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor="url"
                  help={CONNECTION_FIELD_HELP.url}
                  containerClassName="mb-2"
                >
                  NATS Server URL
                </FieldLabel>
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
                <FieldLabel
                  htmlFor="user"
                  help={CONNECTION_FIELD_HELP.user}
                  containerClassName="mb-2"
                >
                  Username (Optional)
                </FieldLabel>
                <Input
                  id="user"
                  type="text"
                  value={formData.user}
                  onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                  placeholder="username"
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor="password"
                  help={CONNECTION_FIELD_HELP.password}
                  containerClassName="mb-2"
                >
                  Password (Optional)
                </FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="password"
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor="token"
                  help={CONNECTION_FIELD_HELP.token}
                  containerClassName="mb-2"
                >
                  Token (Optional)
                </FieldLabel>
                <Input
                  id="token"
                  type="password"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder="token"
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
                    <FieldLabel
                      htmlFor="monitoring_url"
                      help={CONNECTION_FIELD_HELP.monitoringUrl}
                      containerClassName="mb-2"
                    >
                      Monitoring URL (Optional)
                    </FieldLabel>
                    <Input
                      id="monitoring_url"
                      type="text"
                      value={formData.monitoring_url}
                      onChange={(e) => setFormData({ ...formData, monitoring_url: e.target.value })}
                      placeholder="http://localhost:8222"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="sys_user"
                      help={CONNECTION_FIELD_HELP.sysUser}
                      containerClassName="mb-2"
                    >
                      $SYS Username (Optional)
                    </FieldLabel>
                    <Input
                      id="sys_user"
                      type="text"
                      value={formData.sys_user}
                      onChange={(e) => setFormData({ ...formData, sys_user: e.target.value })}
                      placeholder="sys"
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor="sys_password"
                      help={CONNECTION_FIELD_HELP.sysPassword}
                      containerClassName="mb-2"
                    >
                      $SYS Password (Optional)
                    </FieldLabel>
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

              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="remember-secrets"
                  checked={rememberSecrets}
                  onCheckedChange={(checked) => setRememberSecrets(checked === true)}
                />
                <div className="space-y-1">
                  <FieldLabel
                    htmlFor="remember-secrets"
                    className="text-sm font-medium"
                    help={CONNECTION_FIELD_HELP.rememberSecrets}
                  >
                    Save credentials in this browser
                  </FieldLabel>
                  <p className="text-xs text-muted-foreground">
                    When off, saved workspaces keep URLs and labels but omit passwords and tokens.
                  </p>
                </div>
              </div>

              {productionProfile && (
                <Alert variant="warning">
                  <AlertTitle>Production workspace</AlertTitle>
                  <AlertDescription>
                    Destructive actions in this workspace require typed confirmations in the
                    dashboard.
                  </AlertDescription>
                </Alert>
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
                      <Badge
                        variant="outline"
                        className={environmentBadgeClass(connection.environment)}
                      >
                        {connection.environment}
                      </Badge>
                      {!hasStoredSecret(connection) && (
                        <Badge variant="outline" className="rounded-md">
                          no secrets
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {connection.request.url}
                    </p>
                    {connection.last_used_at && (
                      <p className="text-xs text-muted-foreground">
                        Last used {new Date(connection.last_used_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void connectSavedConnection(connection);
                      }}
                      disabled={isConnecting}
                    >
                      Connect
                    </Button>
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
