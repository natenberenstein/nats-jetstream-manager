'use client';

import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';

export function useAuditLog(params: {
  limit?: number;
  offset?: number;
  action?: string;
  resource_type?: string;
  user_id?: number;
} = {}) {
  return useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => auditApi.list(params),
    refetchInterval: 10000,
  });
}
