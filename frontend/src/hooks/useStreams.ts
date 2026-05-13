'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { streamApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { StreamConfig } from '@/lib/types';

export function useStreams(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.streams.list(connectionId),
    queryFn: () => streamApi.list(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });
}

export function useStream(connectionId: string | null, streamName: string | null) {
  return useQuery({
    queryKey: queryKeys.streams.detail(connectionId, streamName),
    queryFn: () => streamApi.get(connectionId!, streamName!),
    enabled: !!connectionId && !!streamName,
    refetchInterval: 5000,
  });
}

export function useCreateStream(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: StreamConfig) => streamApi.create(connectionId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
    },
  });
}

export function useUpdateStream(connectionId: string | null, streamName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<StreamConfig>) =>
      streamApi.update(connectionId!, streamName, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.streams.detail(connectionId, streamName),
      });
    },
  });
}

export function useDeleteStream(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamName: string) => streamApi.delete(connectionId!, streamName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
    },
  });
}

export function usePurgeStream(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamName: string) => streamApi.purge(connectionId!, streamName),
    onSuccess: (_, streamName) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.streams.detail(connectionId, streamName),
      });
    },
  });
}
