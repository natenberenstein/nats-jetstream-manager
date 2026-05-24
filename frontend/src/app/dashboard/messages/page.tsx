'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { messageApi } from '@/lib/api';
import { MessageData } from '@/lib/types';
import { copyText } from '@/lib/download';
import { useConnection } from '@/contexts/ConnectionContext';
import {
  useDeleteStreamMessage,
  useMessages,
  usePublishBatch,
  usePublishMessage,
  useReplayStoredMessage,
} from '@/hooks/useMessages';
import { useCancelJob, useJobs, useStartIndexJob } from '@/hooks/useJobs';
import { useConsumers } from '@/hooks/useConsumers';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useStreams } from '@/hooks/useStreams';
import {
  ViewControls,
  MessagePublishForm,
  AdvancedTools,
  MessageList,
  MessageRemediationPanel,
  DiffCompareCard,
  DiffViewerModal,
} from '@/components/messages';
import { MessageDatePreset, SavedView } from '@/components/messages/types';
import { formatPayload } from '@/components/messages/utils';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import type { DateRange } from '@/components/ui/date-range-picker';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ImpactPreview } from '@/components/operations/ImpactPreview';
import { consumerSubjectMatches } from '@/lib/subject-analysis';
import { GitBranch, Hash, MessageSquare, Users } from 'lucide-react';

const SAVED_VIEWS_KEY = 'nats_saved_message_views_v1';
const FAVORITE_STREAMS_KEY = 'nats_favorite_streams_v1';
const MESSAGE_BOOKMARKS_KEY = 'nats_message_bookmarks_v1';

type WorkspaceMode = 'browse' | 'publish' | 'tools' | 'remediate';
type RemediationContext = 'pending' | 'ack-pending' | 'general';
type MessageFilterKey = 'subject' | 'payload' | 'header' | 'date' | 'sequence';
type MessageActionContext = Pick<MessageData, 'subject' | 'payload_size' | 'headers' | 'time'>;

const DATE_PRESET_LABELS: Record<MessageDatePreset, string> = {
  all: 'Any time',
  today: 'Today',
  '24h': 'Last 24h',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

const MESSAGE_DATE_PRESETS = new Set<MessageDatePreset>([
  'all',
  'today',
  '24h',
  '7d',
  '30d',
  'custom',
]);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isMessageDatePreset(value: string | null): value is MessageDatePreset {
  return Boolean(value && MESSAGE_DATE_PRESETS.has(value as MessageDatePreset));
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeRemediationContext(value: string | null): RemediationContext {
  if (value === 'pending' || value === 'ack-pending') return value;
  return 'general';
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRangeForPreset(preset: MessageDatePreset): DateRange | undefined {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { from: startOfLocalDay(now), to: endOfLocalDay(now) };
    case '24h':
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    case '7d':
      return { from: startOfLocalDay(shiftDays(now, -6)), to: endOfLocalDay(now) };
    case '30d':
      return { from: startOfLocalDay(shiftDays(now, -29)), to: endOfLocalDay(now) };
    case 'custom':
    case 'all':
    default:
      return undefined;
  }
}

function normalizeDateRange(range: DateRange | undefined): DateRange | undefined {
  if (!range?.from) return undefined;
  return {
    from: range.from,
    to: range.to ?? endOfLocalDay(range.from),
  };
}

function parseDateRange(from: string | null, to: string | null): DateRange | undefined {
  if (!from && !to) return undefined;
  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  return {
    from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    to: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
  };
}

function dateValue(range: DateRange | undefined, key: 'from' | 'to'): number | undefined {
  return range?.[key]?.getTime();
}

function areDateRangesEqual(left: DateRange | undefined, right: DateRange | undefined): boolean {
  return (
    dateValue(left, 'from') === dateValue(right, 'from') &&
    dateValue(left, 'to') === dateValue(right, 'to')
  );
}

export default function MessagesPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const { connectionId } = useConnection();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('browse');
  const [maskSensitive, setMaskSensitive] = useState(false);

  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [selectedConsumerName, setSelectedConsumerName] = useState('');
  const [remediationContext, setRemediationContext] = useState<RemediationContext>('general');
  const [subject, setSubject] = useState('');
  const [replaySubject, setReplaySubject] = useState('');

  const [filterSubject, setFilterSubject] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [payloadContains, setPayloadContains] = useState('');
  const [datePreset, setDatePreset] = useState<MessageDatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [focusConsumer, setFocusConsumer] = useState('');
  const [focusWindow, setFocusWindow] = useState<'pending' | 'ack_pending' | ''>('');

  const [liveMode, setLiveMode] = useState(false);
  const [latestMode, setLatestMode] = useState(false);
  const [liveIntervalMs, setLiveIntervalMs] = useState(2000);
  const [autoScroll, setAutoScroll] = useState(true);

  const [limit, setLimit] = useState(25);
  const [seqStart, setSeqStart] = useState<number | undefined>(undefined);
  const [seqEnd, setSeqEnd] = useState<number | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<Array<number | undefined>>([]);
  const [loadedPayloads, setLoadedPayloads] = useState<Record<number, unknown>>({});
  const [expandedPayloads, setExpandedPayloads] = useState<Record<number, boolean>>({});
  const [payloadLoading, setPayloadLoading] = useState<Record<number, boolean>>({});
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const [compareLoading, setCompareLoading] = useState<Record<number, boolean>>({});
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const refetchRef = useRef<() => void>(() => {});
  const [savedViews, setSavedViews] = useLocalStorageState<SavedView[]>(SAVED_VIEWS_KEY, []);
  const [favoriteStreams, setFavoriteStreams] = useLocalStorageState<string[]>(
    FAVORITE_STREAMS_KEY,
    [],
  );
  const [messageBookmarks, setMessageBookmarks] = useLocalStorageState<Record<string, number[]>>(
    MESSAGE_BOOKMARKS_KEY,
    {},
  );

  const [showHeadersCol, setShowHeadersCol] = useState(false);
  const [showSizeCol, setShowSizeCol] = useState(true);
  const [showTimeCol, setShowTimeCol] = useState(true);

  const selectedStreamSubjects = useMemo(() => {
    if (!selectedStream) return [];
    return (
      streamsData?.streams?.find((stream) => stream.config.name === selectedStream)?.config
        .subjects ?? []
    );
  }, [selectedStream, streamsData?.streams]);

  const [indexMatches, setIndexMatches] = useState<
    Array<{ seq: number; subject: string; payload_preview: string }>
  >([]);
  const [indexMeta, setIndexMeta] = useState<{
    indexed_messages: number;
    built_at?: string;
  } | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexLimit, setIndexLimit] = useState(2000);
  const [activeIndexJobId, setActiveIndexJobId] = useState<string | null>(null);

  // Sync URL search params to state
  useEffect(() => {
    const streamFromQuery = searchParams.get('stream');
    const limitFromQuery = searchParams.get('limit');
    const liveFromQuery = searchParams.get('live');
    const filterSubjectFromQuery = searchParams.get('filter_subject');
    const headerKeyFromQuery = searchParams.get('header_key');
    const headerValueFromQuery = searchParams.get('header_value');
    const payloadContainsFromQuery = searchParams.get('payload_contains');
    const seqStartFromQuery = searchParams.get('seq_start');
    const seqEndFromQuery = searchParams.get('seq_end');
    const fromTimeFromQuery = searchParams.get('from_time');
    const toTimeFromQuery = searchParams.get('to_time');
    const datePresetFromQuery = searchParams.get('date_preset') as MessageDatePreset | null;
    const focusFromQuery = searchParams.get('focus');
    const consumerFromQuery = searchParams.get('consumer');

    if (streamFromQuery)
      setSelectedStream((current) => (current === streamFromQuery ? current : streamFromQuery));
    const parsedLimit = parsePositiveInteger(limitFromQuery);
    if (parsedLimit) setLimit((current) => (current === parsedLimit ? current : parsedLimit));
    if (liveFromQuery) setLiveMode(liveFromQuery === '1');
    if (filterSubjectFromQuery) setFilterSubject(filterSubjectFromQuery);
    if (headerKeyFromQuery) setHeaderKey(headerKeyFromQuery);
    if (headerValueFromQuery) setHeaderValue(headerValueFromQuery);
    if (payloadContainsFromQuery) setPayloadContains(payloadContainsFromQuery);
    const parsedSeqStart = parsePositiveInteger(seqStartFromQuery);
    const parsedSeqEnd = parsePositiveInteger(seqEndFromQuery);
    if (parsedSeqStart) {
      setSeqStart((current) => (current === parsedSeqStart ? current : parsedSeqStart));
    }
    if (parsedSeqEnd) {
      setSeqEnd((current) => (current === parsedSeqEnd ? current : parsedSeqEnd));
    }
    if (fromTimeFromQuery || toTimeFromQuery) {
      const nextRange = parseDateRange(fromTimeFromQuery, toTimeFromQuery);
      const nextPreset = isMessageDatePreset(datePresetFromQuery) ? datePresetFromQuery : 'custom';
      setDateRange((current) => (areDateRangesEqual(current, nextRange) ? current : nextRange));
      setDatePreset((current) => (current === nextPreset ? current : nextPreset));
    } else if (isMessageDatePreset(datePresetFromQuery) && datePresetFromQuery !== 'all') {
      const nextRange = dateRangeForPreset(datePresetFromQuery);
      setDatePreset((current) => (current === datePresetFromQuery ? current : datePresetFromQuery));
      setDateRange((current) => (areDateRangesEqual(current, nextRange) ? current : nextRange));
    }
    const remediationFromQuery = searchParams.get('remediation');
    if (remediationFromQuery) {
      setRemediationContext(normalizeRemediationContext(remediationFromQuery));
      setWorkspaceMode('remediate');
      if (consumerFromQuery) setSelectedConsumerName(consumerFromQuery);
    } else {
      if (consumerFromQuery) setFocusConsumer(consumerFromQuery);
      if (focusFromQuery === 'pending' || focusFromQuery === 'ack_pending') {
        setFocusWindow(focusFromQuery);
      }
    }
  }, [searchParams]);

  // Auto-select first stream
  useEffect(() => {
    if (!selectedStream && streamNames.length > 0) {
      const firstStream = streamNames[0];
      setSelectedStream(firstStream);
      const firstSubject = streamsData?.streams?.find((s) => s.config.name === firstStream)?.config
        ?.subjects?.[0];
      if (firstSubject) {
        setSubject(firstSubject);
        setReplaySubject(firstSubject);
      }
    }
    if (selectedStream && !streamNames.includes(selectedStream)) {
      setSelectedStream(streamNames[0] || null);
    }
  }, [selectedStream, streamNames, streamsData?.streams]);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedStream) params.set('stream', selectedStream);
    params.set('limit', String(limit));
    if (workspaceMode === 'remediate' && selectedConsumerName) {
      params.set('consumer', selectedConsumerName);
    }
    if (workspaceMode === 'remediate') {
      params.set('remediation', remediationContext);
    }
    if (liveMode) params.set('live', '1');
    if (filterSubject) params.set('filter_subject', filterSubject);
    if (headerKey) params.set('header_key', headerKey);
    if (headerValue) params.set('header_value', headerValue);
    if (payloadContains) params.set('payload_contains', payloadContains);
    if (seqStart) params.set('seq_start', String(seqStart));
    if (seqEnd) params.set('seq_end', String(seqEnd));
    if (datePreset !== 'all') params.set('date_preset', datePreset);
    const normalizedRange = normalizeDateRange(dateRange);
    if (normalizedRange?.from) params.set('from_time', normalizedRange.from.toISOString());
    if (normalizedRange?.to) params.set('to_time', normalizedRange.to.toISOString());
    if (focusConsumer) params.set('consumer', focusConsumer);
    if (focusWindow) params.set('focus', focusWindow);
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [
    selectedStream,
    selectedConsumerName,
    remediationContext,
    workspaceMode,
    limit,
    liveMode,
    filterSubject,
    headerKey,
    headerValue,
    payloadContains,
    seqStart,
    seqEnd,
    datePreset,
    dateRange,
    focusConsumer,
    focusWindow,
    pathname,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target as HTMLElement | null)?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setWorkspaceMode('publish');
        window.setTimeout(() => subjectInputRef.current?.focus(), 0);
      }
      if (event.key.toLowerCase() === 'r' && !isTyping) {
        event.preventDefault();
        void refetchRef.current();
      }
      if (event.key.toLowerCase() === 'l' && !isTyping) {
        event.preventDefault();
        setLiveMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const queryParams = useMemo(() => {
    const normalizedRange = normalizeDateRange(dateRange);

    return {
      limit,
      seqStart,
      seqEnd,
      fromLatest: liveMode || latestMode,
      filterSubject: filterSubject || undefined,
      headerKey: headerKey || undefined,
      headerValue: headerValue || undefined,
      payloadContains: payloadContains || undefined,
      fromTime: normalizedRange?.from?.toISOString(),
      toTime: normalizedRange?.to?.toISOString(),
      previewBytes: 2048,
      scanLimit: Math.min(Math.max(limit * 30, 2000), 10000),
    };
  }, [
    limit,
    seqStart,
    seqEnd,
    liveMode,
    latestMode,
    filterSubject,
    headerKey,
    headerValue,
    payloadContains,
    dateRange,
  ]);

  const {
    data: messagesData,
    isLoading,
    isFetching,
    isError,
    error: messagesError,
    refetch,
  } = useMessages(connectionId, selectedStream, queryParams, liveMode ? liveIntervalMs : false);
  refetchRef.current = refetch;
  const { data: consumersData } = useConsumers(connectionId, selectedStream);
  const consumers = useMemo(() => consumersData?.consumers ?? [], [consumersData?.consumers]);
  const publishMessage = usePublishMessage(connectionId);
  const publishBatch = usePublishBatch(connectionId);
  const replayStoredMessage = useReplayStoredMessage(connectionId);
  const deleteStreamMessage = useDeleteStreamMessage(connectionId);
  const startIndexJob = useStartIndexJob(connectionId);
  const cancelJob = useCancelJob(connectionId);
  const { data: jobsData } = useJobs(connectionId, !!connectionId);

  // Auto-scroll on live mode
  useEffect(() => {
    if (liveMode && autoScroll && listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [messagesData, liveMode, autoScroll]);

  const currentMessages = useMemo(() => messagesData?.messages ?? [], [messagesData?.messages]);
  const currentBookmarks = useMemo(() => {
    if (!selectedStream) return [];
    return messageBookmarks[selectedStream] ?? [];
  }, [messageBookmarks, selectedStream]);
  const diffMessages = useMemo(
    () =>
      compareSelection
        .map((seq) => currentMessages.find((m) => m.seq === seq))
        .filter((m): m is MessageData => !!m),
    [compareSelection, currentMessages],
  );

  useEffect(() => {
    if (!consumersData) return;
    if (workspaceMode !== 'remediate') return;
    if (!selectedConsumerName && consumers.length > 0) {
      setSelectedConsumerName(consumers[0].name);
      return;
    }
    if (
      selectedConsumerName &&
      consumers.length > 0 &&
      !consumers.some((consumer) => consumer.name === selectedConsumerName)
    ) {
      setSelectedConsumerName(consumers[0].name);
    }
  }, [consumers, consumersData, selectedConsumerName, workspaceMode]);

  // Load missing payloads for diff comparison
  useEffect(() => {
    if (!connectionId || !selectedStream || diffMessages.length !== 2) return;

    const loadMissingPayloads = async () => {
      for (const msg of diffMessages) {
        if (Object.prototype.hasOwnProperty.call(loadedPayloads, msg.seq)) continue;
        setCompareLoading((prev) => ({ ...prev, [msg.seq]: true }));
        try {
          const fullMessage = await messageApi.getMessage(connectionId, selectedStream, msg.seq);
          setLoadedPayloads((prev) => ({ ...prev, [msg.seq]: fullMessage.data }));
        } catch (error) {
          console.error('Failed to load compare payload', msg.seq, error);
        } finally {
          setCompareLoading((prev) => ({ ...prev, [msg.seq]: false }));
        }
      }
    };

    void loadMissingPayloads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, selectedStream, diffMessages]);

  // Hide diff viewer when less than 2 messages selected
  useEffect(() => {
    if (diffMessages.length !== 2) {
      setShowDiffViewer(false);
    }
  }, [diffMessages.length]);

  // Track active index job
  const activeIndexJob = useMemo(
    () => (jobsData?.jobs || []).find((job) => job.id === activeIndexJobId) || null,
    [jobsData?.jobs, activeIndexJobId],
  );

  useEffect(() => {
    if (!activeIndexJob) return;
    if (activeIndexJob.status === 'completed') {
      const indexed = Number(activeIndexJob.result?.indexed_messages ?? 0);
      setIndexMeta({
        indexed_messages: indexed,
        built_at: activeIndexJob.completed_at || undefined,
      });
      toast.success(`Index build completed (${indexed} messages).`);
      setActiveIndexJobId(null);
    } else if (activeIndexJob.status === 'failed') {
      toast.error(activeIndexJob.error || 'Index build failed');
      setActiveIndexJobId(null);
    } else if (activeIndexJob.status === 'cancelled') {
      toast.info('Index build cancelled.');
      setActiveIndexJobId(null);
    }
  }, [activeIndexJob]);

  // --- Handlers ---

  const resetMessageCursor = () => {
    setSeqStart(undefined);
    setSeqEnd(undefined);
    setCursorHistory([]);
  };

  const handleSelectStream = (streamName: string) => {
    setSelectedStream(streamName);
    setSelectedConsumerName('');
    setRemediationContext('general');
    setLatestMode(false);
    resetMessageCursor();
    setLoadedPayloads({});
    setExpandedPayloads({});
    setPayloadLoading({});
    setCompareSelection([]);

    const selected = streamsData?.streams?.find((stream) => stream.config.name === streamName);
    if (selected?.config?.subjects?.[0]) {
      setSubject(selected.config.subjects[0]);
      setReplaySubject(selected.config.subjects[0]);
    }
  };

  const handleLatestMessages = () => {
    const nextLatestMode = !latestMode;
    const shouldRefetchCurrentPage =
      liveMode && nextLatestMode && seqStart === undefined && seqEnd === undefined;

    setLiveMode(false);
    setLatestMode(nextLatestMode);
    resetMessageCursor();

    if (shouldRefetchCurrentPage) {
      void refetch();
    }
  };

  const handlePublish = async (params: {
    subject: string;
    payload: unknown;
    headers?: Record<string, string>;
    batch?: boolean;
    messages?: unknown[];
  }) => {
    try {
      if (params.batch && params.messages) {
        const result = await publishBatch.mutateAsync({
          subject: params.subject,
          messages: params.messages,
          headers: params.headers,
        });
        toast.success(`Published ${result.published} messages.`);
      } else {
        const result = await publishMessage.mutateAsync({
          subject: params.subject,
          data: params.payload,
          headers: params.headers,
        });
        toast.success(`Published to stream ${result.stream}, sequence ${result.seq}.`);
      }
      await refetch();
    } catch (publishError) {
      toast.error(
        publishError instanceof Error ? publishError.message : 'Failed to publish message',
      );
    }
  };

  const handleNextPage = () => {
    if (!messagesData?.next_seq) return;
    const fromLatest = liveMode || latestMode;
    setCursorHistory((prev) => [...prev, fromLatest ? seqEnd : seqStart]);
    if (fromLatest) {
      setSeqEnd(messagesData.next_seq || undefined);
    } else {
      setSeqStart(messagesData.next_seq || undefined);
    }
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length === 0) return;
    const previous = [...cursorHistory];
    const previousSeq = previous.pop();
    setCursorHistory(previous);
    if (liveMode || latestMode) {
      setSeqEnd(previousSeq);
    } else {
      setSeqStart(previousSeq);
    }
  };

  const handleFirstPage = () => {
    setCursorHistory([]);
    setSeqStart(undefined);
    setSeqEnd(undefined);
  };

  const handleGoToPage = (page: number) => {
    if (!messagesData?.first_seq || !messagesData?.last_seq) return;
    if (page <= 1) {
      handleFirstPage();
      return;
    }
    const { first_seq, last_seq } = messagesData;
    const seqRange = last_seq - first_seq + 1;
    const totalPages = Math.ceil(messagesData.total / limit);
    // Estimate sequence for the target page proportionally across the seq range
    const targetSeq = latestMode
      ? Math.round(last_seq - ((page - 1) / totalPages) * seqRange)
      : Math.round(first_seq + ((page - 1) / totalPages) * seqRange);
    const clampedSeq = Math.max(first_seq, Math.min(targetSeq, last_seq));
    // Build a synthetic cursor history so "Prev" goes back to page 1
    const history: Array<number | undefined> = [undefined];
    for (let p = 2; p < page; p++) {
      const hSeq = latestMode
        ? Math.round(last_seq - ((p - 1) / totalPages) * seqRange)
        : Math.round(first_seq + ((p - 1) / totalPages) * seqRange);
      history.push(Math.max(first_seq, Math.min(hSeq, last_seq)));
    }
    setCursorHistory(history);
    if (latestMode) {
      setSeqStart(undefined);
      setSeqEnd(clampedSeq);
    } else {
      setSeqStart(clampedSeq);
      setSeqEnd(undefined);
    }
  };

  const handleGoToSequence = (seq: number) => {
    setLiveMode(false);
    setLatestMode(false);
    setCursorHistory([]);
    setSeqStart(seq);
    setSeqEnd(undefined);
  };

  const handleSequenceRangeChange = (start: number | undefined, end: number | undefined) => {
    setLiveMode(false);
    setLatestMode(false);
    setCursorHistory([]);
    setSeqStart(start);
    setSeqEnd(end);
    setFocusConsumer('');
    setFocusWindow('');
  };

  const handleLoadPayload = async (seq: number) => {
    if (!connectionId || !selectedStream) return;
    if (Object.prototype.hasOwnProperty.call(loadedPayloads, seq)) {
      setExpandedPayloads((prev) => ({ ...prev, [seq]: true }));
      return;
    }
    setPayloadLoading((prev) => ({ ...prev, [seq]: true }));
    try {
      const fullMessage = await messageApi.getMessage(connectionId, selectedStream, seq);
      setLoadedPayloads((prev) => ({ ...prev, [seq]: fullMessage.data }));
      setExpandedPayloads((prev) => ({ ...prev, [seq]: true }));
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : 'Failed to load full payload');
    } finally {
      setPayloadLoading((prev) => ({ ...prev, [seq]: false }));
    }
  };

  const handleHidePayload = (seq: number) => {
    setExpandedPayloads((prev) => ({ ...prev, [seq]: false }));
  };

  const handleReplayMessage = async (message: MessageData) => {
    if (!connectionId || !selectedStream || !replaySubject.trim()) {
      toast.error('Replay subject is required.');
      return;
    }
    const targetSubject = replaySubject.trim();
    const matchingConsumers = consumers.filter((consumer) =>
      consumerSubjectMatches(consumer.config, targetSubject),
    );
    const confirmed = await confirm({
      title: 'Replay message',
      description: (
        <>
          Publish stream sequence <span className="font-mono font-semibold">{message.seq}</span> to{' '}
          <span className="font-mono font-semibold">{targetSubject}</span>.
        </>
      ),
      body: (
        <ImpactPreview
          title="Replay impact"
          tone="warning"
          metrics={[
            { label: 'Source seq', value: message.seq, icon: Hash },
            { label: 'Target consumers', value: matchingConsumers.length, icon: Users },
            {
              label: 'Payload size',
              value: `${message.payload_size ?? 0} bytes`,
              icon: MessageSquare,
            },
            { label: 'Headers', value: Object.keys(message.headers ?? {}).length, icon: GitBranch },
          ]}
          rows={[
            { label: 'Source subject', value: message.subject },
            { label: 'Target subject', value: targetSubject, tone: 'warning' },
            {
              label: 'Matching consumers',
              value: matchingConsumers.length
                ? matchingConsumers.map((consumer) => consumer.name).join(', ')
                : 'none on selected stream',
            },
          ]}
          notes={[
            'Replay publishes a new message and can trigger downstream side effects.',
            'Headers are copied by the backend replay endpoint.',
          ]}
        />
      ),
      confirmLabel: 'Replay message',
    });
    if (!confirmed) return;

    try {
      const result = await replayStoredMessage.mutateAsync({
        streamName: selectedStream,
        seq: message.seq,
        request: {
          target_subject: targetSubject,
          copy_headers: true,
        },
      });
      toast.success(
        `Replayed seq ${message.seq} to ${targetSubject} as seq ${result.published_seq}.`,
      );
    } catch (replayError) {
      toast.error(replayError instanceof Error ? replayError.message : 'Failed to replay message');
    }
  };

  const handleDeleteStreamMessage = async (seq: number, context?: MessageActionContext) => {
    if (!connectionId || !selectedStream) return;

    const typedConfirmation = `${selectedStream}:${seq}`;
    const message = context ?? currentMessages.find((item) => item.seq === seq);
    const matchingConsumers = message?.subject
      ? consumers.filter((consumer) => consumerSubjectMatches(consumer.config, message.subject))
      : [];
    const confirmed = await confirm({
      title: 'Erase stream message',
      description: (
        <>
          This deletes stream sequence <span className="font-mono font-semibold">{seq}</span>. It is
          not a consumer acknowledgement.
        </>
      ),
      body: (
        <ImpactPreview
          title="Message delete impact"
          tone="destructive"
          metrics={[
            { label: 'Sequence', value: seq, icon: Hash },
            {
              label: 'Matching consumers',
              value: matchingConsumers.length,
              icon: Users,
            },
            {
              label: 'Payload size',
              value: `${message?.payload_size ?? 0} bytes`,
              icon: MessageSquare,
            },
            {
              label: 'Headers',
              value: Object.keys(message?.headers ?? {}).length,
              icon: GitBranch,
            },
          ]}
          rows={[
            { label: 'Stream', value: selectedStream },
            { label: 'Subject', value: message?.subject ?? 'unknown' },
            {
              label: 'Affected consumers',
              value: matchingConsumers.length
                ? matchingConsumers.map((consumer) => consumer.name).join(', ')
                : 'unknown or none',
              tone: matchingConsumers.length > 0 ? 'warning' : 'default',
            },
          ]}
          notes={[
            'The message is erased from the stream for every consumer.',
            'Ack, nak, or term is safer when the goal is consumer delivery remediation only.',
          ]}
        />
      ),
      confirmLabel: 'Erase message',
      tone: 'destructive',
      requireTypedConfirmation: typedConfirmation,
    });
    if (!confirmed) return;

    try {
      const result = await deleteStreamMessage.mutateAsync({
        streamName: selectedStream,
        seq,
        request: {
          confirm_stream_name: selectedStream,
          confirm_seq: seq,
          erase: true,
        },
      });
      toast.success(`Deleted stream message ${result.stream_name}:${result.seq}.`);
      setLoadedPayloads((prev) => {
        const next = { ...prev };
        delete next[seq];
        return next;
      });
      await refetch();
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete message');
    }
  };

  const handleCopyCli = async (message: MessageData) => {
    if (!connectionId || !selectedStream) return;
    try {
      let payload = loadedPayloads[message.seq];
      if (payload === undefined) {
        const fullMessage = await messageApi.getMessage(connectionId, selectedStream, message.seq);
        payload = fullMessage.data ?? fullMessage.data_preview ?? '';
        setLoadedPayloads((prev) => ({ ...prev, [message.seq]: payload }));
      }
      const headers = Object.entries(message.headers ?? {}).flatMap(([key, value]) => [
        '-H',
        shellQuote(`${key}: ${value}`),
      ]);
      const command = [
        'nats',
        'pub',
        shellQuote(message.subject),
        shellQuote(formatPayload(payload)),
        ...headers,
      ].join(' ');
      await copyText(command);
      toast.success(`Copied CLI publish command for seq ${message.seq}.`);
    } catch (copyError) {
      toast.error(copyError instanceof Error ? copyError.message : 'Failed to copy CLI command');
    }
  };

  const toggleMessageBookmark = (seq: number) => {
    if (!selectedStream) return;
    setMessageBookmarks((prev) => {
      const current = prev[selectedStream] ?? [];
      const nextForStream = current.includes(seq)
        ? current.filter((item) => item !== seq)
        : [...current, seq].sort((a, b) => a - b);
      return { ...prev, [selectedStream]: nextForStream };
    });
  };

  const toggleCompareSelection = (seq: number) => {
    setCompareSelection((prev) => {
      if (prev.includes(seq)) {
        return prev.filter((s) => s !== seq);
      }
      if (prev.length >= 2) {
        return [prev[1], seq];
      }
      return [...prev, seq];
    });
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    resetMessageCursor();
  };

  const handleDatePresetChange = (preset: MessageDatePreset) => {
    setDatePreset(preset);
    setDateRange(dateRangeForPreset(preset));
    resetMessageCursor();
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDatePreset(range?.from ? 'custom' : 'all');
    setDateRange(range);
    resetMessageCursor();
  };

  const handleFilterSubjectChange = (value: string) => {
    setFilterSubject(value);
    resetMessageCursor();
  };

  const handleHeaderKeyChange = (value: string) => {
    setHeaderKey(value);
    resetMessageCursor();
  };

  const handleHeaderValueChange = (value: string) => {
    setHeaderValue(value);
    resetMessageCursor();
  };

  const handlePayloadContainsChange = (value: string) => {
    setPayloadContains(value);
    resetMessageCursor();
  };

  const clearMessageFilters = () => {
    setFilterSubject('');
    setHeaderKey('');
    setHeaderValue('');
    setPayloadContains('');
    setDatePreset('all');
    setDateRange(undefined);
    setSeqStart(undefined);
    setSeqEnd(undefined);
    setFocusConsumer('');
    setFocusWindow('');
    resetMessageCursor();
  };

  const clearMessageFilter = (filter: MessageFilterKey) => {
    switch (filter) {
      case 'subject':
        setFilterSubject('');
        break;
      case 'payload':
        setPayloadContains('');
        break;
      case 'header':
        setHeaderKey('');
        setHeaderValue('');
        break;
      case 'date':
        setDatePreset('all');
        setDateRange(undefined);
        break;
      case 'sequence':
        setSeqStart(undefined);
        setSeqEnd(undefined);
        setFocusConsumer('');
        setFocusWindow('');
        setCursorHistory([]);
        break;
    }
  };

  const toggleFavoriteStream = () => {
    if (!selectedStream) return;
    const next = favoriteStreams.includes(selectedStream)
      ? favoriteStreams.filter((s) => s !== selectedStream)
      : [...favoriteStreams, selectedStream];
    setFavoriteStreams(next);
  };

  const saveCurrentView = async () => {
    const name = await prompt({
      title: 'Save view',
      label: 'View name',
      placeholder: 'e.g. High-priority orders',
      confirmLabel: 'Save view',
    });
    if (!name) return;
    const params = new URLSearchParams();
    if (selectedStream) params.set('stream', selectedStream);
    params.set('limit', String(limit));
    if (liveMode) params.set('live', '1');
    if (filterSubject) params.set('filter_subject', filterSubject);
    if (headerKey) params.set('header_key', headerKey);
    if (headerValue) params.set('header_value', headerValue);
    if (payloadContains) params.set('payload_contains', payloadContains);
    if (seqStart) params.set('seq_start', String(seqStart));
    if (seqEnd) params.set('seq_end', String(seqEnd));
    if (datePreset !== 'all') params.set('date_preset', datePreset);
    const normalizedRange = normalizeDateRange(dateRange);
    if (normalizedRange?.from) params.set('from_time', normalizedRange.from.toISOString());
    if (normalizedRange?.to) params.set('to_time', normalizedRange.to.toISOString());
    if (focusConsumer) params.set('consumer', focusConsumer);
    if (focusWindow) params.set('focus', focusWindow);
    const nextViews = [
      ...savedViews.filter((v) => v.name !== name),
      { name, query: Object.fromEntries(params) },
    ];
    setSavedViews(nextViews);
    toast.success(`View "${name}" saved.`);
  };

  const applySavedView = (name: string) => {
    const view = savedViews.find((v) => v.name === name);
    if (!view) return;
    const q = view.query;
    setSelectedStream(q.stream || null);
    setLimit(Number(q.limit || 25));
    setLiveMode(q.live === '1');
    setFilterSubject(q.filter_subject || '');
    setHeaderKey(q.header_key || '');
    setHeaderValue(q.header_value || '');
    setPayloadContains(q.payload_contains || '');
    setSeqStart(q.seq_start ? Number(q.seq_start) : undefined);
    setSeqEnd(q.seq_end ? Number(q.seq_end) : undefined);
    setDatePreset((q.date_preset as MessageDatePreset) || 'all');
    setDateRange(parseDateRange(q.from_time || null, q.to_time || null));
    setFocusConsumer(q.consumer || '');
    setFocusWindow(q.focus === 'pending' || q.focus === 'ack_pending' ? q.focus : '');
    setCursorHistory([]);
  };

  const handleBuildIndex = async () => {
    if (!connectionId || !selectedStream) return;
    setIndexLoading(true);
    try {
      const job = await startIndexJob.mutateAsync({
        streamName: selectedStream,
        limit: indexLimit,
      });
      setActiveIndexJobId(job.id);
      toast.success(`Started background index job ${job.id.slice(0, 8)}…`);
    } catch (buildError) {
      toast.error(
        buildError instanceof Error ? buildError.message : 'Failed to build message index',
      );
    } finally {
      setIndexLoading(false);
    }
  };

  const renderPublishPanel = () => (
    <MessagePublishForm
      connectionId={connectionId}
      selectedStream={selectedStream}
      streamNames={streamNames}
      streamsData={streamsData}
      favoriteStreams={favoriteStreams}
      subject={subject}
      replaySubject={replaySubject}
      subjectInputRef={subjectInputRef}
      isPublishing={publishMessage.isPending || publishBatch.isPending}
      onSubjectChange={setSubject}
      onReplaySubjectChange={setReplaySubject}
      onSelectStream={handleSelectStream}
      onToggleFavorite={toggleFavoriteStream}
      onPublish={handlePublish}
    />
  );

  const renderToolsPanel = () => (
    <>
      <AdvancedTools
        connectionId={connectionId}
        selectedStream={selectedStream}
        compareSelection={compareSelection}
        currentMessages={currentMessages}
        loadedPayloads={loadedPayloads}
        activeIndexJob={activeIndexJob}
        indexMeta={indexMeta}
        indexMatches={indexMatches}
        indexLoading={indexLoading}
        indexLimit={indexLimit}
        onIndexLimitChange={setIndexLimit}
        onBuildIndex={handleBuildIndex}
        onCancelJob={(jobId) => cancelJob.mutate(jobId)}
        cancelJobPending={cancelJob.isPending}
        onRefetch={refetch}
        onSetLoadedPayloads={setLoadedPayloads}
        onSetIndexMatches={setIndexMatches}
        onSetIndexMeta={setIndexMeta}
      />

      <DiffCompareCard
        diffMessages={diffMessages}
        compareLoading={compareLoading}
        onOpen={() => setShowDiffViewer(true)}
      />
    </>
  );

  const renderRemediationPanel = () => (
    <MessageRemediationPanel
      connectionId={connectionId}
      selectedStream={selectedStream}
      consumers={consumers}
      selectedConsumerName={selectedConsumerName}
      context={remediationContext}
      replaySubject={replaySubject}
      onConsumerChange={setSelectedConsumerName}
      onReplaySubjectChange={setReplaySubject}
      onDeleteMessage={(message) => handleDeleteStreamMessage(message.seq, message)}
    />
  );

  const renderMessageList = (className?: string) => (
    <MessageList
      className={className}
      selectedStream={selectedStream}
      streamNames={streamNames}
      consumers={consumers}
      messagesData={messagesData}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      messagesError={messagesError}
      maskSensitive={maskSensitive}
      liveMode={liveMode}
      latestMode={latestMode}
      limit={limit}
      seqStart={seqStart}
      seqEnd={seqEnd}
      liveIntervalMs={liveIntervalMs}
      bookmarks={currentBookmarks}
      cursorHistory={cursorHistory}
      compareSelection={compareSelection}
      expandedPayloads={expandedPayloads}
      loadedPayloads={loadedPayloads}
      payloadLoading={payloadLoading}
      showHeadersCol={showHeadersCol}
      showSizeCol={showSizeCol}
      showTimeCol={showTimeCol}
      filterSubject={filterSubject}
      headerKey={headerKey}
      headerValue={headerValue}
      payloadContains={payloadContains}
      datePreset={datePreset}
      dateRange={dateRange}
      datePresetLabels={DATE_PRESET_LABELS}
      subjectOptions={selectedStreamSubjects}
      focusConsumer={focusConsumer}
      focusWindow={focusWindow}
      isPublishing={publishMessage.isPending || replayStoredMessage.isPending}
      diffMessagesCount={diffMessages.length}
      listContainerRef={listContainerRef}
      onLimitChange={handleLimitChange}
      onSelectStream={handleSelectStream}
      onLatestMessages={handleLatestMessages}
      onLiveModeChange={setLiveMode}
      onLiveIntervalChange={setLiveIntervalMs}
      onRefetch={refetch}
      onNextPage={handleNextPage}
      onPreviousPage={handlePreviousPage}
      onFirstPage={handleFirstPage}
      onGoToPage={handleGoToPage}
      onGoToSequence={handleGoToSequence}
      onToggleBookmark={toggleMessageBookmark}
      onToggleCompare={toggleCompareSelection}
      onLoadPayload={handleLoadPayload}
      onHidePayload={handleHidePayload}
      onReplayMessage={handleReplayMessage}
      onCopyCli={handleCopyCli}
      onDeleteMessage={(message) => {
        void handleDeleteStreamMessage(message.seq, message);
      }}
      onShowDiffViewer={() => setShowDiffViewer(true)}
      onFilterSubjectChange={handleFilterSubjectChange}
      onHeaderKeyChange={handleHeaderKeyChange}
      onHeaderValueChange={handleHeaderValueChange}
      onPayloadContainsChange={handlePayloadContainsChange}
      onDatePresetChange={handleDatePresetChange}
      onDateRangeChange={handleDateRangeChange}
      onSequenceRangeChange={handleSequenceRangeChange}
      onClearFilter={clearMessageFilter}
      onClearFilters={clearMessageFilters}
      onShowHeadersColChange={setShowHeadersCol}
      onShowSizeColChange={setShowSizeCol}
      onShowTimeColChange={setShowTimeCol}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Messages"
        description="Publish, filter, compare, replay, remediate, and monitor messages"
      />

      <ViewControls
        savedViews={savedViews}
        liveMode={liveMode}
        autoScroll={autoScroll}
        maskSensitive={maskSensitive}
        onLiveModeChange={setLiveMode}
        onAutoScrollChange={setAutoScroll}
        onMaskSensitiveChange={setMaskSensitive}
        onSaveView={saveCurrentView}
        onApplyView={applySavedView}
      />

      <Tabs
        value={workspaceMode}
        onValueChange={(value) => setWorkspaceMode(value as WorkspaceMode)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-4 sm:w-auto">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="remediate">Remediate</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-0">
          {renderMessageList()}
        </TabsContent>

        <TabsContent value="publish" className="mt-0">
          {/* Mobile: stacked. Desktop: resizable split. */}
          <div className="space-y-6 xl:hidden">
            {renderPublishPanel()}
            {renderMessageList()}
          </div>
          <ResizablePanelGroup
            direction="horizontal"
            className="hidden min-h-[640px] rounded-md xl:flex"
          >
            <ResizablePanel defaultSize={40} minSize={28} className="min-w-0">
              <div className="min-w-0 pr-3">{renderPublishPanel()}</div>
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={60} minSize={36} className="min-w-0">
              <div className="min-w-0 pl-3">{renderMessageList()}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="tools" className="mt-0">
          <div className="space-y-6 xl:hidden">
            {renderToolsPanel()}
            {renderMessageList()}
          </div>
          <ResizablePanelGroup
            direction="horizontal"
            className="hidden min-h-[640px] rounded-md xl:flex"
          >
            <ResizablePanel defaultSize={40} minSize={28} className="min-w-0">
              <div className="min-w-0 space-y-6 pr-3">{renderToolsPanel()}</div>
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={60} minSize={36} className="min-w-0">
              <div className="min-w-0 pl-3">{renderMessageList()}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="remediate" className="mt-0">
          <div className="space-y-6 xl:hidden">
            {renderRemediationPanel()}
            {renderMessageList()}
          </div>
          <ResizablePanelGroup
            direction="horizontal"
            className="hidden min-h-[640px] rounded-md xl:flex"
          >
            <ResizablePanel defaultSize={44} minSize={32} className="min-w-0">
              <div className="min-w-0 pr-3">{renderRemediationPanel()}</div>
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={56} minSize={36} className="min-w-0">
              <div className="min-w-0 pl-3">{renderMessageList()}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>
      </Tabs>

      <DiffViewerModal
        diffMessages={diffMessages}
        loadedPayloads={loadedPayloads}
        compareLoading={compareLoading}
        maskSensitive={maskSensitive}
        showDiffViewer={showDiffViewer}
        onClose={() => setShowDiffViewer(false)}
        onOpen={() => setShowDiffViewer(true)}
        onError={(msg) => toast.error(msg)}
      />
    </div>
  );
}
