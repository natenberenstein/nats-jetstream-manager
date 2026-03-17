'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Zap, CheckCircle, XCircle } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function HomePage() {
  const router = useRouter();
  const { connect, testConnection, isConnecting, error } = useConnection();

  const [formData, setFormData] = useState({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
  });

  const [testResult, setTestResult] = useState<{
    success: boolean;
    jetstream: boolean;
    error?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

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
      router.push('/dashboard');
    } catch {
      // handled by connection context
    }
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

              {testResult && (
                <Alert
                  variant={testResult.success ? 'default' : 'destructive'}
                  className={
                    testResult.success
                      ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 [&>svg]:text-emerald-600'
                      : undefined
                  }
                >
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
      </div>
    </div>
  );
}
