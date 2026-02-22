'use client';

import { useQuery } from '@tanstack/react-query';
import { connectionHealthApi } from '@/lib/api';

export function useHealthHistory(connectionId: string | null, window = 24) {
  return useQuery({
    queryKey: ['health-history', connectionId, window],
    queryFn: () => connectionHealthApi.getHistory(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}

export function useUptimeSummary(connectionId: string | null, window = 24) {
  return useQuery({
    queryKey: ['uptime-summary', connectionId, window],
    queryFn: () => connectionHealthApi.getUptime(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}
