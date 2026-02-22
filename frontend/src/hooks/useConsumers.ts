'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consumerApi } from '@/lib/api';
import { ConsumerConfig } from '@/lib/types';

export function useConsumers(connectionId: string | null, streamName: string | null) {
  return useQuery({
    queryKey: ['consumers', connectionId, streamName],
    queryFn: () => consumerApi.list(connectionId!, streamName!),
    enabled: !!connectionId && !!streamName,
    refetchInterval: 5000,
  });
}

export function useConsumerAnalytics(connectionId: string | null, streamName: string | null) {
  return useQuery({
    queryKey: ['consumer-analytics', connectionId, streamName],
    queryFn: () => consumerApi.analytics(connectionId!, streamName!),
    enabled: !!connectionId && !!streamName,
    refetchInterval: 5000,
  });
}

export function useConsumer(
  connectionId: string | null,
  streamName: string | null,
  consumerName: string | null
) {
  return useQuery({
    queryKey: ['consumer', connectionId, streamName, consumerName],
    queryFn: () => consumerApi.get(connectionId!, streamName!, consumerName!),
    enabled: !!connectionId && !!streamName && !!consumerName,
    refetchInterval: 5000,
  });
}

export function useCreateConsumer(connectionId: string | null, streamName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: ConsumerConfig) => {
      if (!connectionId || !streamName) {
        throw new Error('Connection and stream are required');
      }
      return consumerApi.create(connectionId, streamName, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumers', connectionId, streamName] });
      queryClient.invalidateQueries({ queryKey: ['streams', connectionId] });
    },
  });
}

export function useDeleteConsumer(connectionId: string | null, streamName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (consumerName: string) => {
      if (!connectionId || !streamName) {
        throw new Error('Connection and stream are required');
      }
      return consumerApi.delete(connectionId, streamName, consumerName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumers', connectionId, streamName] });
      queryClient.invalidateQueries({ queryKey: ['streams', connectionId] });
    },
  });
}
