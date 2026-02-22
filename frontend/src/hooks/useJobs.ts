'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { jobApi } from '@/lib/api';

export function useJobs(connectionId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['jobs', connectionId],
    queryFn: () => jobApi.list(connectionId!),
    enabled: !!connectionId && enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}

export function useStartIndexJob(connectionId: string | null) {
  return useMutation({
    mutationFn: (params: { streamName: string; limit?: number }) =>
      jobApi.startIndexBuild(connectionId!, params.streamName, params.limit),
  });
}

export function useCancelJob(connectionId: string | null) {
  return useMutation({
    mutationFn: (jobId: string) => jobApi.cancel(connectionId!, jobId),
  });
}
