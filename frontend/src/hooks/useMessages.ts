'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GetMessagesParams, messageApi } from '@/lib/api';
import { MessagePublishRequest } from '@/lib/types';

export function useMessages(
  connectionId: string | null,
  streamName: string | null,
  params: GetMessagesParams = {},
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: ['messages', connectionId, streamName, params],
    queryFn: () => messageApi.getMessages(connectionId!, streamName!, params),
    enabled: !!connectionId && !!streamName,
    refetchInterval,
  });
}

export function useMessage(
  connectionId: string | null,
  streamName: string | null,
  seq: number | null,
) {
  return useQuery({
    queryKey: ['message', connectionId, streamName, seq],
    queryFn: () => messageApi.getMessage(connectionId!, streamName!, seq!),
    enabled: !!connectionId && !!streamName && seq !== null,
  });
}

export function usePublishMessage(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: MessagePublishRequest) => messageApi.publish(connectionId!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', connectionId] });
    },
  });
}

export function usePublishBatch(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      subject,
      messages,
      headers,
    }: {
      subject: string;
      messages: unknown[];
      headers?: Record<string, string>;
    }) => messageApi.publishBatch(connectionId!, subject, messages, headers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams', connectionId] });
    },
  });
}
