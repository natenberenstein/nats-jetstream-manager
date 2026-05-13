'use client';

import { useQuery } from '@tanstack/react-query';
import { clusterApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useClusterOverview(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.cluster.overview(connectionId),
    queryFn: () => clusterApi.getOverview(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 10000,
  });
}
