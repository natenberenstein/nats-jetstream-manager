'use client';

import { useQuery } from '@tanstack/react-query';

import { auditApi, AuditListParams } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useAuditEntries(params: AuditListParams = {}) {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: () => auditApi.list(params),
    refetchInterval: 30_000,
  });
}
