'use client';

import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GetMessagesParams, messageApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
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
  queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.streamMetrics.all(connectionId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.consumers.diagnostics(connectionId) });

  if (!streamName) return;
  queryClient.invalidateQueries({ queryKey: queryKeys.streams.detail(connectionId, streamName) });
  queryClient.invalidateQueries({
    queryKey: queryKeys.messages.byStream(connectionId, streamName),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.messages.detailByStream(connectionId, streamName),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.streamMetrics.detail(connectionId, streamName),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.consumers.list(connectionId, streamName) });
  queryClient.invalidateQueries({
    queryKey: queryKeys.consumers.analytics(connectionId, streamName),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.consumers.metrics(connectionId, streamName),
  });

  if (!consumerName) return;
  queryClient.invalidateQueries({
    queryKey: queryKeys.consumers.detail(connectionId, streamName, consumerName),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.consumers.metric(connectionId, streamName, consumerName),
  });
}

export function useMessages(
  connectionId: string | null,
  streamName: string | null,
  params: GetMessagesParams = {},
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: queryKeys.messages.list(connectionId, streamName, params),
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
    queryKey: queryKeys.messages.detail(connectionId, streamName, seq),
    queryFn: () => messageApi.getMessage(connectionId!, streamName!, seq!),
    enabled: !!connectionId && !!streamName && seq !== null,
  });
}

export function usePublishMessage(connectionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: MessagePublishRequest) => messageApi.publish(connectionId!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.streams.list(connectionId) });
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
