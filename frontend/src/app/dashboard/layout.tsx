'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection } from '@/contexts/ConnectionContext';
import {
  Database,
  Layers,
  Users,
  MessageSquare,
  LogOut,
  Activity,
  Search,
  Network,
  LineChart,
  BarChart3,
  HeartPulse,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { connectionId, url, connected, connections, switchConnection, disconnect } =
    useConnection();
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  useEffect(() => {
    if (!connected || !connectionId) {
      router.push('/');
    }
  }, [connected, connectionId, router]);

  const handleDisconnect = async () => {
    await disconnect();
    if (connections.length <= 1) {
      router.push('/');
    }
  };

  const navItems = [
    { href: '/dashboard', icon: Activity, label: 'Overview' },
    { href: '/dashboard/cluster', icon: Network, label: 'Cluster' },
    {
      href: '/dashboard/observability',
      icon: LineChart,
      label: 'Observability',
    },
    { href: '/dashboard/metrics', icon: BarChart3, label: 'Metrics' },
    { href: '/dashboard/health', icon: HeartPulse, label: 'Health' },
    { href: '/dashboard/clusters', icon: Database, label: 'Clusters' },
    { href: '/dashboard/audit', icon: Shield, label: 'Audit Log' },
    { href: '/dashboard/streams', icon: Layers, label: 'Streams' },
    { href: '/dashboard/consumers', icon: Users, label: 'Consumers' },
    { href: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredCommands = navItems.filter((item) =>
    item.label.toLowerCase().includes(commandQuery.toLowerCase()),
  );

  if (!connected) {
    return null;
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="bg-background border-b">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">NATS JetStream Manager</h1>
              <p className="text-sm text-muted-foreground">{url}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={connectionId || ''}
              onChange={(e) => switchConnection(e.target.value)}
              className="w-52"
            >
              {connections.map((conn) => (
                <option key={conn.connectionId} value={conn.connectionId}>
                  {conn.name}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => setCommandOpen(true)}>
              <Search className="w-4 h-4" />
              Command
            </Button>
            <Button onClick={handleDisconnect} variant="outline">
              <LogOut className="w-4 h-4" />
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-background border-r min-h-[calc(100vh-73px)] flex flex-col">
          <nav className="p-4 space-y-1 flex-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-md transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>

      {commandOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-24"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-background border rounded-lg shadow-lg p-4 space-y-3"
            onClick={(event) => event.stopPropagation()}
          >
            <Input
              autoFocus
              placeholder="Type a command (e.g. streams, messages)..."
              value={commandQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCommandQuery(e.target.value)}
            />
            <div className="max-h-72 overflow-auto space-y-1">
              {filteredCommands.map((item) => (
                <button
                  key={item.href}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    router.push(item.href);
                    setCommandOpen(false);
                    setCommandQuery('');
                  }}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
