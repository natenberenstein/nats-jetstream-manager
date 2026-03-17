'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { connectionApi } from '@/lib/api';
import { ConnectionRequest, ConnectionResponse } from '@/lib/types';

interface ManagedConnection {
  connectionId: string;
  name: string;
  url: string;
  connected: boolean;
  jetstream: boolean;
  createdAt?: string;
  lastAccessed?: string;
}

interface ConnectionState {
  connectionId: string | null;
  url: string | null;
  connected: boolean;
  jetstream: boolean;
  connections: ManagedConnection[];
  activeConnectionId: string | null;
}

interface ConnectionContextValue extends ConnectionState {
  connect: (
    request: ConnectionRequest,
    options?: { name?: string; makeActive?: boolean },
  ) => Promise<void>;
  disconnect: (connectionId?: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  switchConnection: (connectionId: string) => void;
  renameConnection: (connectionId: string, name: string) => void;
  refreshConnections: () => Promise<void>;
  testConnection: (
    request: ConnectionRequest,
  ) => Promise<{ success: boolean; jetstream_enabled: boolean; error?: string }>;
  isConnecting: boolean;
  error: string | null;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

const CONNECTION_META_KEY = 'nats_connections_meta_v2';
const ACTIVE_CONNECTION_KEY = 'nats_active_connection_v2';
const LEGACY_CONNECTION_KEY = 'nats_connection';

interface ConnectionMeta {
  name: string;
  url?: string;
}

function safeParseMeta(raw: string | null): Record<string, ConnectionMeta> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, ConnectionMeta>;
  } catch {
    // ignore invalid local data
  }
  return {};
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<ManagedConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistMeta = useCallback(
    (nextConnections: ManagedConnection[], nextActiveId: string | null) => {
      if (typeof window === 'undefined') return;
      const meta: Record<string, ConnectionMeta> = {};
      for (const conn of nextConnections) {
        meta[conn.connectionId] = { name: conn.name, url: conn.url };
      }
      localStorage.setItem(CONNECTION_META_KEY, JSON.stringify(meta));
      if (nextActiveId) localStorage.setItem(ACTIVE_CONNECTION_KEY, nextActiveId);
      else localStorage.removeItem(ACTIVE_CONNECTION_KEY);
    },
    [],
  );

  const refreshConnections = useCallback(async () => {
    setError(null);
    try {
      const response = await connectionApi.list();
      const activeList = response.connections || [];
      const meta =
        typeof window !== 'undefined'
          ? safeParseMeta(localStorage.getItem(CONNECTION_META_KEY))
          : {};
      const preferredActive =
        typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_CONNECTION_KEY) : null;

      const merged = activeList.map((conn, idx) => {
        const fallbackName = `Cluster ${idx + 1}`;
        const existing = meta[conn.connection_id];
        return {
          connectionId: conn.connection_id,
          name: existing?.name || fallbackName,
          url: conn.url,
          connected: conn.connected,
          jetstream: conn.jetstream_enabled,
          createdAt: conn.created_at,
          lastAccessed: conn.last_accessed,
        } as ManagedConnection;
      });

      const nextActiveId =
        (preferredActive && merged.some((c) => c.connectionId === preferredActive)
          ? preferredActive
          : null) ||
        (activeConnectionId && merged.some((c) => c.connectionId === activeConnectionId)
          ? activeConnectionId
          : null) ||
        merged[0]?.connectionId ||
        null;

      setConnections(merged);
      setActiveConnectionId(nextActiveId);
      persistMeta(merged, nextActiveId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh connections';
      setError(message);
    }
  }, [activeConnectionId, persistMeta]);

  const testConnection = useCallback(async (request: ConnectionRequest) => {
    setError(null);
    try {
      return await connectionApi.test(request);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
      throw err;
    }
  }, []);

  const connect = useCallback(
    async (request: ConnectionRequest, options?: { name?: string; makeActive?: boolean }) => {
      setIsConnecting(true);
      setError(null);
      try {
        const response: ConnectionResponse = await connectionApi.connect(request);
        const makeActive = options?.makeActive ?? true;
        setConnections((prev) => {
          const existing = prev.filter((c) => c.connectionId !== response.connection_id);
          const nextName = options?.name?.trim() || `Cluster ${existing.length + 1}`;
          const next = [
            ...existing,
            {
              connectionId: response.connection_id,
              name: nextName,
              url: request.url,
              connected: true,
              jetstream: true,
            },
          ];
          const nextActive = makeActive ? response.connection_id : activeConnectionId;
          persistMeta(next, nextActive || null);
          if (makeActive) setActiveConnectionId(response.connection_id);
          return next;
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [activeConnectionId, persistMeta],
  );

  const disconnect = useCallback(
    async (connectionId?: string) => {
      const targetId = connectionId || activeConnectionId;
      if (!targetId) return;

      try {
        await connectionApi.disconnect(targetId);
        setConnections((prev) => {
          const next = prev.filter((c) => c.connectionId !== targetId);
          const nextActive =
            activeConnectionId === targetId ? next[0]?.connectionId || null : activeConnectionId;
          setActiveConnectionId(nextActive);
          persistMeta(next, nextActive);
          return next;
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Disconnect failed');
        throw err;
      }
    },
    [activeConnectionId, persistMeta],
  );

  const disconnectAll = useCallback(async () => {
    const ids = connections.map((c) => c.connectionId);
    for (const id of ids) {
      try {
        await connectionApi.disconnect(id);
      } catch {
        // Continue disconnecting other clusters.
      }
    }
    setConnections([]);
    setActiveConnectionId(null);
    persistMeta([], null);
  }, [connections, persistMeta]);

  const switchConnection = useCallback(
    (connectionId: string) => {
      if (!connections.some((c) => c.connectionId === connectionId)) return;
      setActiveConnectionId(connectionId);
      persistMeta(connections, connectionId);
    },
    [connections, persistMeta],
  );

  const renameConnection = useCallback(
    (connectionId: string, name: string) => {
      const normalized = name.trim();
      if (!normalized) return;
      setConnections((prev) => {
        const next = prev.map((conn) =>
          conn.connectionId === connectionId ? { ...conn, name: normalized } : conn,
        );
        persistMeta(next, activeConnectionId);
        return next;
      });
    },
    [activeConnectionId, persistMeta],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const legacyRaw = sessionStorage.getItem(LEGACY_CONNECTION_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw) as { connectionId?: string };
        if (parsed.connectionId && !localStorage.getItem(ACTIVE_CONNECTION_KEY)) {
          localStorage.setItem(ACTIVE_CONNECTION_KEY, parsed.connectionId);
        }
      } catch {
        // ignore
      }
      sessionStorage.removeItem(LEGACY_CONNECTION_KEY);
    }

    void refreshConnections();
  }, [refreshConnections]);

  const activeConnection = useMemo(
    () => connections.find((conn) => conn.connectionId === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  const value = useMemo<ConnectionContextValue>(
    () => ({
      connectionId: activeConnection?.connectionId || null,
      url: activeConnection?.url || null,
      connected: !!activeConnection,
      jetstream: activeConnection?.jetstream || false,
      connections,
      activeConnectionId,
      connect,
      disconnect,
      disconnectAll,
      switchConnection,
      renameConnection,
      refreshConnections,
      testConnection,
      isConnecting,
      error,
    }),
    [
      activeConnection,
      connections,
      activeConnectionId,
      connect,
      disconnect,
      disconnectAll,
      switchConnection,
      renameConnection,
      refreshConnections,
      testConnection,
      isConnecting,
      error,
    ],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}
