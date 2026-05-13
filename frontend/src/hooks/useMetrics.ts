'use client';

import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useStreamMetrics(connectionId: string | null, streamName: string, window = 15) {
  return useQuery({
    queryKey: queryKeys.streamMetrics.detail(connectionId, streamName, window),
    queryFn: () => metricsApi.getStreamMetrics(connectionId!, streamName, window),
    enabled: !!connectionId && !!streamName,
    refetchInterval: 5000,
  });
}

export function useAllStreamMetrics(connectionId: string | null, window = 15) {
  return useQuery({
    queryKey: queryKeys.streamMetrics.all(connectionId, window),
    queryFn: () => metricsApi.getAllStreamMetrics(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}
