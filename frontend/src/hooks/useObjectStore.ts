'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { objectStoreApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { ObjectStoreCreateConfig } from '@/lib/types';

export function useObjectStores(connectionId: string | null) {
  return useQuery({
    queryKey: queryKeys.objectStore.stores(connectionId),
    queryFn: () => objectStoreApi.list(connectionId!),
    enabled: !!connectionId,
    refetchInterval: 5000,
  });
}

export function useObjectStoreStatus(connectionId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: queryKeys.objectStore.status(connectionId, bucket),
    queryFn: () => objectStoreApi.getStatus(connectionId!, bucket!),
    enabled: !!connectionId && !!bucket,
  });
}

export function useCreateObjectStore(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: ObjectStoreCreateConfig) => objectStoreApi.create(connectionId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.stores(connectionId) });
    },
  });
}

export function useDeleteObjectStore(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bucket: string) => objectStoreApi.delete(connectionId!, bucket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.stores(connectionId) });
    },
  });
}

export function useObjectList(connectionId: string | null, bucket: string | null) {
  return useQuery({
    queryKey: queryKeys.objectStore.list(connectionId, bucket),
    queryFn: () => objectStoreApi.listObjects(connectionId!, bucket!),
    enabled: !!connectionId && !!bucket,
    refetchInterval: 5000,
  });
}

export function usePutObject(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      data,
      description,
    }: {
      name: string;
      data: string;
      description?: string;
    }) => objectStoreApi.putObject(connectionId!, bucket!, name, data, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.list(connectionId, bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.stores(connectionId) });
    },
  });
}

export function useDeleteObject(connectionId: string | null, bucket: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => objectStoreApi.deleteObject(connectionId!, bucket!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.list(connectionId, bucket) });
      queryClient.invalidateQueries({ queryKey: queryKeys.objectStore.stores(connectionId) });
    },
  });
}
