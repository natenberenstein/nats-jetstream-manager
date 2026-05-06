'use client';

import { useQuery } from '@tanstack/react-query';

import { auditApi, AuditListParams } from '@/lib/api';

export function useAuditEntries(params: AuditListParams = {}) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => auditApi.list(params),
    refetchInterval: 30_000,
  });
}
