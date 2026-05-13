'use client';

import { useQuery } from '@tanstack/react-query';
import { connectionHealthApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useHealthHistory(connectionId: string | null, window = 24) {
  return useQuery({
    queryKey: queryKeys.health.history(connectionId, window),
    queryFn: () => connectionHealthApi.getHistory(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}

export function useUptimeSummary(connectionId: string | null, window = 24) {
  return useQuery({
    queryKey: queryKeys.health.uptime(connectionId, window),
    queryFn: () => connectionHealthApi.getUptime(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}
