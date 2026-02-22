'use client';

import { useQuery } from '@tanstack/react-query';
import { systemApi } from '@/lib/api';

export function useSystemObservability(connectionId: string | null) {
  return useQuery({
    queryKey: ['system-observability', connectionId],
    queryFn: () => systemApi.observability(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}
