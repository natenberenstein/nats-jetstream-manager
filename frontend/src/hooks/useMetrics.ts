'use client';

import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';

export function useStreamMetrics(connectionId: string | null, streamName: string, window = 15) {
  return useQuery({
    queryKey: ['stream-metrics', connectionId, streamName, window],
    queryFn: () => metricsApi.getStreamMetrics(connectionId!, streamName, window),
    enabled: !!connectionId && !!streamName,
    refetchInterval: 5000,
  });
}

export function useAllStreamMetrics(connectionId: string | null, window = 15) {
  return useQuery({
    queryKey: ['all-stream-metrics', connectionId, window],
    queryFn: () => metricsApi.getAllStreamMetrics(connectionId!, window),
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}
