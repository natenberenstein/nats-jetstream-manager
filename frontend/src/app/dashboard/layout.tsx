'use client';

import { useEffect, useState } from 'react';
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
  Key,
  HardDrive,
  Moon,
  Sun,
  Menu,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CommandPalette, type CommandItem } from '@/components/layout/CommandPalette';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { connectionId, url, connected, disconnect } = useConnection();
  const { theme, toggleTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!connected || !connectionId) {
      router.push('/');
    }
  }, [connected, connectionId, router]);

  const handleDisconnect = async () => {
    await disconnect();
    router.push('/');
  };

  const navSections = [
    {
      items: [{ href: '/dashboard', icon: Activity, label: 'Overview' }],
    },
    {
      label: 'Cluster',
      items: [
        { href: '/dashboard/cluster', icon: Network, label: 'Cluster' },
        { href: '/dashboard/observability', icon: LineChart, label: 'Observability' },
        { href: '/dashboard/metrics', icon: BarChart3, label: 'Metrics' },
        { href: '/dashboard/health', icon: HeartPulse, label: 'Health' },
      ],
    },
    {
      label: 'Streaming',
      items: [
        { href: '/dashboard/streams', icon: Layers, label: 'Streams' },
        { href: '/dashboard/consumers', icon: Users, label: 'Consumers' },
        { href: '/dashboard/messages', icon: MessageSquare, label: 'Messages' },
      ],
    },
    {
      label: 'Storage',
      items: [
        { href: '/dashboard/kv', icon: Key, label: 'KV Stores' },
        { href: '/dashboard/objectstore', icon: HardDrive, label: 'Object Store' },
      ],
    },
  ];

  const navItems: CommandItem[] = navSections.flatMap((section) =>
    section.items.map((item) => ({ ...item, keywords: section.label ? [section.label] : [] })),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!connected) {
    return null;
  }

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-3 p-3">
      {navSections.map((section, sectionIndex) => (
        <div key={section.label ?? `section-${sectionIndex}`} className="space-y-0.5">
          {section.label && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="bg-background border-b">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b p-4">
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                {renderNav(() => setMobileNavOpen(false))}
              </SheetContent>
            </Sheet>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-tight sm:text-base">
                NATS JetStream Manager
              </h1>
              <p className="truncate text-xs text-muted-foreground">{url}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)}>
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Command</span>
              <kbd className="ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground md:inline">
                ⌘K
              </kbd>
            </Button>
            <Button onClick={handleDisconnect} variant="outline" size="sm">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-56 flex-col border-r bg-background min-h-[calc(100vh-57px)] md:flex">
          {renderNav()}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} items={navItems} />
    </div>
  );
}
