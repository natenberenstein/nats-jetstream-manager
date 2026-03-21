'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kvApi } from '@/lib/api';
import { KvCreateConfig } from '@/lib/types';

export function useKvStores(connectionId: string | null) {
  return useQuery({
    queryKey: ['kv-stores', connectionId],
    queryFn: () => kvApi.list(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}

export function useKvStatus(connectionId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: ['kv-status', connectionId, bucket],
    queryFn: () => kvApi.getStatus(connectionId!, bucket!),
    enabled: !!connectionId && !!bucket,
  });
}

export function useCreateKvStore(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: KvCreateConfig) => kvApi.create(connectionId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kv-stores', connectionId] });
    },
  });
}

export function useDeleteKvStore(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucket: string) => kvApi.delete(connectionId!, bucket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kv-stores', connectionId] });
    },
  });
}

export function useKvKeys(connectionId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: ['kv-keys', connectionId, bucket],
    queryFn: () => kvApi.listKeys(connectionId!, bucket!),
    enabled: !!connectionId && !!bucket,
    refetchInterval: 5000,
  });
}

export function useKvEntry(connectionId: string | null, bucket: string | null, key: string | null) {
  return useQuery({
    queryKey: ['kv-entry', connectionId, bucket, key],
    queryFn: () => kvApi.getKey(connectionId!, bucket!, key!),
    enabled: !!connectionId && !!bucket && !!key,
  });
}

export function usePutKvEntry(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      kvApi.putKey(connectionId!, bucket!, key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kv-keys', connectionId, bucket] });
      queryClient.invalidateQueries({ queryKey: ['kv-entry', connectionId, bucket] });
      queryClient.invalidateQueries({ queryKey: ['kv-stores', connectionId] });
    },
  });
}

export function useKvWatchHistory(
  connectionId: string | null,
  bucket: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['kv-watch', connectionId, bucket],
    queryFn: () => kvApi.watchHistory(connectionId!, bucket!),
    enabled: !!connectionId && !!bucket && enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}

export function useDeleteKvEntry(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => kvApi.deleteKey(connectionId!, bucket!, key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kv-keys', connectionId, bucket] });
      queryClient.invalidateQueries({ queryKey: ['kv-entry', connectionId, bucket] });
      queryClient.invalidateQueries({ queryKey: ['kv-stores', connectionId] });
    },
  });
}
