'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Zap, CheckCircle, XCircle, LogIn, UserPlus } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function HomePage() {
  const router = useRouter();
  const { connect, testConnection, isConnecting, error } = useConnection();
  const { user, isAuthenticated, login, signup, logout, isLoading: authLoading } = useAuth();

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', fullName: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    url: 'nats://localhost:4222',
    user: '',
    password: '',
  });

  const [testResult, setTestResult] = useState<{ success: boolean; jetstream: boolean; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'login') {
        await login(authForm.email, authForm.password);
      } else {
        await signup(authForm.email, authForm.password, authForm.fullName || undefined);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    setIsTesting(true);
    try {
      const result = await testConnection(formData);
      setTestResult({ success: result.success, jetstream: result.jetstream_enabled, error: result.error });
    } catch (err) {
      setTestResult({ success: false, jetstream: false, error: err instanceof Error ? err.message : 'Connection test failed' });
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
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
              <Database className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold mb-2">NATS JetStream Manager</h1>
            <p className="text-muted-foreground">Authenticate and connect to your NATS cluster</p>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Connection</CardTitle>
              <CardDescription>Authenticate and connect to your NATS server</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="space-y-6">
                <div>
                  <Label htmlFor="url" className="mb-2 block">NATS Server URL</Label>
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
                  <Label htmlFor="user" className="mb-2 block">Username (Optional)</Label>
                  <Input
                    id="user"
                    type="text"
                    value={formData.user}
                    onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                    placeholder="username"
                  />
                </div>

                <div>
                  <Label htmlFor="password" className="mb-2 block">Password (Optional)</Label>
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
                    className={testResult.success ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300 [&>svg]:text-emerald-600' : undefined}
                  >
                    {testResult.success ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <AlertTitle>Connection successful</AlertTitle>
                        <AlertDescription>Connected! JetStream: {testResult.jetstream ? 'Enabled' : 'Disabled'}</AlertDescription>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        <AlertTitle>Connection failed</AlertTitle>
                        <AlertDescription>{testResult.error || 'Check URL and credentials.'}</AlertDescription>
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
                  <Button type="button" variant="secondary" onClick={handleTest} disabled={isConnecting || isTesting || !isAuthenticated} className="flex-1">
                    {isTesting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                  <Button type="submit" disabled={isConnecting || !isAuthenticated} className="flex-1">
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

                {!isAuthenticated && (
                  <p className="text-xs text-muted-foreground">Sign in first to open a cluster session.</p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Account</CardTitle>
              <CardDescription>Create an account, sign in, and manage your profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAuthenticated && user ? (
                <div className="space-y-3">
                  <p className="text-sm">Signed in as <span className="font-medium">{user.email}</span> ({user.role})</p>
                  <div className="flex gap-2">
                    <Button onClick={() => router.push('/dashboard/profile')} variant="outline">Profile</Button>
                    <Button onClick={logout} variant="destructive">Sign Out</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button variant={authMode === 'login' ? 'default' : 'outline'} onClick={() => setAuthMode('login')}>
                      <LogIn className="w-4 h-4" /> Login
                    </Button>
                    <Button variant={authMode === 'signup' ? 'default' : 'outline'} onClick={() => setAuthMode('signup')}>
                      <UserPlus className="w-4 h-4" /> Sign Up
                    </Button>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-3">
                    {authMode === 'signup' && (
                      <div>
                        <Label htmlFor="fullName" className="mb-1 block">Full Name</Label>
                        <Input id="fullName" value={authForm.fullName} onChange={(e) => setAuthForm((p) => ({ ...p, fullName: e.target.value }))} />
                      </div>
                    )}
                    <div>
                      <Label htmlFor="email" className="mb-1 block">Email</Label>
                      <Input id="email" type="email" value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} required />
                    </div>
                    <div>
                      <Label htmlFor="authPassword" className="mb-1 block">Password</Label>
                      <Input id="authPassword" type="password" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} required />
                    </div>
                    <Button type="submit" disabled={authLoading} className="w-full">
                      {authMode === 'login' ? 'Login' : 'Create Account'}
                    </Button>
                  </form>

                  {authError && (
                    <Alert variant="destructive">
                      <XCircle className="w-5 h-5" />
                      <AlertTitle>Authentication Error</AlertTitle>
                      <AlertDescription>{authError}</AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
