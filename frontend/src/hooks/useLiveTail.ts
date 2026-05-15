'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { messageApi } from '@/lib/api';
import { LiveTailEvent, LiveTailMessage } from '@/lib/types';

type LiveTailStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface UseLiveTailParams {
  subject: string;
  enabled: boolean;
  maxMessages: number;
  previewBytes?: number;
  includePayload?: boolean;
}

export function useLiveTail(
  connectionId: string | null,
  { subject, enabled, maxMessages, previewBytes = 4096, includePayload = true }: UseLiveTailParams,
) {
  const [messages, setMessages] = useState<LiveTailMessage[]>([]);
  const [status, setStatus] = useState<LiveTailStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setReceivedCount(0);
  }, []);

  useEffect(() => {
    const trimmedSubject = subject.trim();

    if (!connectionId || !enabled || !trimmedSubject) {
      closeSource();
      setStatus('idle');
      return;
    }

    closeSource();
    setStatus('connecting');
    setError(null);

    const source = new EventSource(
      messageApi.tailUrl(connectionId, {
        subject: trimmedSubject,
        includePayload,
        previewBytes,
      }),
    );
    sourceRef.current = source;

    source.onopen = () => {
      setStatus('connected');
      setError(null);
    };

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as LiveTailEvent;
        setLastEventAt(parsed.received_at);

        if (parsed.event_type === 'message' && parsed.message) {
          setReceivedCount((value) => value + 1);
          setMessages((current) => [parsed.message!, ...current].slice(0, maxMessages));
        }
      } catch {
        setError('Received an unreadable live-tail event.');
      }
    };

    source.onerror = () => {
      setStatus('error');
      setError('Live tail connection interrupted.');
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };

    return () => {
      source.close();
      if (sourceRef.current === source) {
        sourceRef.current = null;
      }
    };
  }, [closeSource, connectionId, enabled, includePayload, maxMessages, previewBytes, subject]);

  const stop = useCallback(() => {
    closeSource();
    setStatus('idle');
  }, [closeSource]);

  return {
    messages,
    status,
    error,
    lastEventAt,
    receivedCount,
    clear,
    stop,
  };
}
