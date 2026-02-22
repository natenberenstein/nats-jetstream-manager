'use client';

import { useQuery } from '@tanstack/react-query';
import { clusterApi } from '@/lib/api';

export function useClusterOverview(connectionId: string | null) {
  return useQuery({
    queryKey: ['cluster-overview', connectionId],
    queryFn: () => clusterApi.getOverview(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}
