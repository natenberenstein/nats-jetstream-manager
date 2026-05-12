'use client';

import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GetMessagesParams, messageApi } from '@/lib/api';
import {
  MessageDeleteRequest,
  MessagePublishRequest,
  MessageRemediationActionRequest,
  MessageRemediationFetchRequest,
  MessageReplayRequest,
} from '@/lib/types';

function invalidateMessageState(
  queryClient: ReturnType<typeof useQueryClient>,
  connectionId: string | null,
  streamName?: string,
  consumerName?: string,
) {
  queryClient.invalidateQueries({ queryKey: ['streams', connectionId] });
  queryClient.invalidateQueries({ queryKey: ['all-stream-metrics', connectionId] });
  queryClient.invalidateQueries({ queryKey: ['consumer-diagnostics', connectionId] });

  if (!streamName) return;
  queryClient.invalidateQueries({ queryKey: ['stream', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['messages', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['message', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['stream-metrics', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['consumers', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['consumer-analytics', connectionId, streamName] });
  queryClient.invalidateQueries({ queryKey: ['consumer-metrics', connectionId, streamName] });

  if (!consumerName) return;
  queryClient.invalidateQueries({
    queryKey: ['consumer', connectionId, streamName, consumerName],
  });
  queryClient.invalidateQueries({
    queryKey: ['consumer-metric', connectionId, streamName, consumerName],
  });
}

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
    placeholderData: keepPreviousData,
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

export function useReplayStoredMessage(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      streamName,
      seq,
      request,
    }: {
      streamName: string;
      seq: number;
      request: MessageReplayRequest;
    }) => messageApi.replay(connectionId!, streamName, seq, request),
    onSuccess: (_, variables) => {
      invalidateMessageState(queryClient, connectionId, variables.streamName);
    },
  });
}

export function useFetchRemediationMessages(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      streamName,
      consumerName,
      request,
    }: {
      streamName: string;
      consumerName: string;
      request: MessageRemediationFetchRequest;
    }) => messageApi.remediationFetch(connectionId!, streamName, consumerName, request),
    onSuccess: (_, variables) => {
      invalidateMessageState(
        queryClient,
        connectionId,
        variables.streamName,
        variables.consumerName,
      );
    },
  });
}

export function useApplyRemediationAction(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      streamName,
      consumerName,
      request,
    }: {
      streamName: string;
      consumerName: string;
      request: MessageRemediationActionRequest;
    }) => messageApi.remediationAction(connectionId!, streamName, consumerName, request),
    onSuccess: (_, variables) => {
      invalidateMessageState(
        queryClient,
        connectionId,
        variables.streamName,
        variables.consumerName,
      );
    },
  });
}

export function useDeleteStreamMessage(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      streamName,
      seq,
      request,
    }: {
      streamName: string;
      seq: number;
      request: MessageDeleteRequest;
    }) => messageApi.deleteStreamMessage(connectionId!, streamName, seq, request),
    onSuccess: (_, variables) => {
      invalidateMessageState(queryClient, connectionId, variables.streamName);
    },
  });
}
