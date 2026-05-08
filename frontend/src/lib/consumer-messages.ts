import { ConsumerDiagnostic } from '@/lib/types';

export type ConsumerMessageWindow = 'ack_pending' | 'pending';

interface ConsumerMessagesHrefParams {
  streamName: string;
  consumerName: string;
  diagnostic?: ConsumerDiagnostic | null;
  filterSubject?: string | null;
  window: ConsumerMessageWindow;
}

export function buildConsumerMessagesHref({
  streamName,
  consumerName,
  diagnostic,
  filterSubject,
  window,
}: ConsumerMessagesHrefParams): string | null {
  if (!diagnostic) return null;

  const start =
    window === 'ack_pending'
      ? Math.max(1, diagnostic.ack_floor_stream_seq + 1)
      : Math.max(1, diagnostic.delivered_stream_seq + 1);
  const end =
    window === 'ack_pending' ? diagnostic.delivered_stream_seq : diagnostic.last_stream_seq;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  const params = new URLSearchParams({
    stream: streamName,
    consumer: consumerName,
    focus: window,
    seq_start: String(start),
    seq_end: String(end),
  });

  if (filterSubject?.trim()) {
    params.set('filter_subject', filterSubject.trim());
  }

  return `/dashboard/messages?${params.toString()}`;
}
