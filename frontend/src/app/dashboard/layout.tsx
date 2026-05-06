'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
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
  FileClock,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { CommandPalette, type CommandItem } from '@/components/layout/CommandPalette';
import { DashboardBreadcrumb } from '@/components/layout/DashboardBreadcrumb';
import { useConnection } from '@/contexts/ConnectionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useStreams } from '@/hooks/useStreams';
import { useKvStores } from '@/hooks/useKv';
import { useObjectStores } from '@/hooks/useObjectStore';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { connectionId, url, connected, disconnect } = useConnection();
  const { theme, toggleTheme } = useTheme();
  const { data: streamsData } = useStreams(connectionId);
  const { data: kvData } = useKvStores(connectionId);
  const { data: objectStoreData } = useObjectStores(connectionId);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (!connected || !connectionId) {
      router.push('/');
    }
  }, [connected, connectionId, router]);

  const handleDisconnect = async () => {
    await disconnect();
    router.push('/');
  };

  const navSections = useMemo(
    () => [
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
      {
        label: 'Operations',
        items: [{ href: '/dashboard/audit', icon: FileClock, label: 'Audit Log' }],
      },
    ],
    [],
  );

  const commandItems = useMemo<CommandItem[]>(() => {
    const navItems: CommandItem[] = navSections.flatMap((section) =>
      section.items.map((item) => ({
        ...item,
        group: 'Navigation',
        keywords: section.label ? [section.label] : [],
      })),
    );

    const streamItems: CommandItem[] = (streamsData?.streams ?? []).flatMap((stream) => {
      const name = stream.config.name;
      const encoded = encodeURIComponent(name);
      const keywords = ['stream', ...(stream.config.subjects ?? [])];
      return [
        {
          href: `/dashboard/streams/${encoded}`,
          icon: Layers,
          label: name,
          group: 'Streams',
          keywords,
        },
        {
          href: `/dashboard/messages?stream=${encoded}`,
          icon: MessageSquare,
          label: `Messages: ${name}`,
          group: 'Streams',
          keywords: ['messages', ...keywords],
        },
      ];
    });

    const kvItems: CommandItem[] = (kvData?.kv_stores ?? []).map((store) => ({
      href: `/dashboard/kv?bucket=${encodeURIComponent(store.bucket)}`,
      icon: Key,
      label: store.bucket,
      group: 'KV Stores',
      keywords: ['kv', 'bucket', store.description || ''],
    }));

    const objectItems: CommandItem[] = (objectStoreData?.object_stores ?? []).map((store) => ({
      href: `/dashboard/objectstore?bucket=${encodeURIComponent(store.bucket)}`,
      icon: HardDrive,
      label: store.bucket,
      group: 'Object Stores',
      keywords: ['object', 'bucket', store.description || ''],
    }));

    return [...navItems, ...streamItems, ...kvItems, ...objectItems];
  }, [kvData?.kv_stores, navSections, objectStoreData?.object_stores, streamsData?.streams]);

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

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
              <Database className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="grid flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold leading-tight">NATS JetStream</span>
              <span className="truncate text-xs text-muted-foreground">{url}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {navSections.map((section, idx) => (
            <SidebarGroup key={section.label ?? `section-${idx}`}>
              {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleDisconnect} tooltip="Disconnect">
                <LogOut />
                <span>Disconnect</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <DashboardBreadcrumb />

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCommandOpen(true)}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="ml-1 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground md:inline">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </SidebarInset>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} items={commandItems} />
    </SidebarProvider>
  );
}
