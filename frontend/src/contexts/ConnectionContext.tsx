'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { connectionApi } from '@/lib/api';
import { ConnectionRequest, ConnectionResponse } from '@/lib/types';

interface ConnectionState {
  connectionId: string | null;
  url: string | null;
  connected: boolean;
  jetstream: boolean;
}

interface ConnectionContextValue extends ConnectionState {
  connect: (request: ConnectionRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  testConnection: (
    request: ConnectionRequest,
  ) => Promise<{ success: boolean; jetstream_enabled: boolean; error?: string }>;
  isConnecting: boolean;
  error: string | null;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

const CONNECTION_KEY = 'nats_connection_v3';

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [jetstream, setJetstream] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback((id: string | null, connUrl: string | null) => {
    if (typeof window === 'undefined') return;
    if (id) {
      localStorage.setItem(CONNECTION_KEY, JSON.stringify({ connectionId: id, url: connUrl }));
    } else {
      localStorage.removeItem(CONNECTION_KEY);
    }
  }, []);

  const refreshConnection = useCallback(async () => {
    setError(null);
    try {
      const response = await connectionApi.list();
      const activeList = response.connections || [];

      if (activeList.length > 0) {
        const conn = activeList[0];
        setConnectionId(conn.connection_id);
        setUrl(conn.url);
        setConnected(conn.connected);
        setJetstream(conn.jetstream_enabled);
        persist(conn.connection_id, conn.url);
      } else {
        setConnectionId(null);
        setUrl(null);
        setConnected(false);
        setJetstream(false);
        persist(null, null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh connection';
      setError(message);
    }
  }, [persist]);

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
    async (request: ConnectionRequest) => {
      setIsConnecting(true);
      setError(null);
      try {
        const response: ConnectionResponse = await connectionApi.connect(request);
        setConnectionId(response.connection_id);
        setUrl(request.url);
        setConnected(true);
        setJetstream(true);
        persist(response.connection_id, request.url);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [persist],
  );

  const disconnect = useCallback(async () => {
    if (!connectionId) return;
    try {
      await connectionApi.disconnect(connectionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
      throw err;
    }
    setConnectionId(null);
    setUrl(null);
    setConnected(false);
    setJetstream(false);
    persist(null, null);
  }, [connectionId, persist]);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      connectionId,
      url,
      connected,
      jetstream,
      connect,
      disconnect,
      refreshConnection,
      testConnection,
      isConnecting,
      error,
    }),
    [
      connectionId,
      url,
      connected,
      jetstream,
      connect,
      disconnect,
      refreshConnection,
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
