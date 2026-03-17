'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { messageApi } from '@/lib/api';
import { MessageData } from '@/lib/types';
import { useConnection } from '@/contexts/ConnectionContext';
import { useMessages, usePublishBatch, usePublishMessage } from '@/hooks/useMessages';
import { useCancelJob, useJobs, useStartIndexJob } from '@/hooks/useJobs';
import { useStreams } from '@/hooks/useStreams';
import {
  ViewControls,
  MessagePublishForm,
  AdvancedTools,
  MessageList,
  DiffCompareCard,
  DiffViewerModal,
} from '@/components/messages';
import { SavedView } from '@/components/messages/types';

const SAVED_VIEWS_KEY = 'nats_saved_message_views_v1';
const FAVORITE_STREAMS_KEY = 'nats_favorite_streams_v1';

export default function MessagesPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const { connectionId } = useConnection();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [maskSensitive, setMaskSensitive] = useState(false);

  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [replaySubject, setReplaySubject] = useState('');

  const [filterSubject, setFilterSubject] = useState('');
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [payloadContains, setPayloadContains] = useState('');

  const [liveMode, setLiveMode] = useState(false);
  const [liveIntervalMs, setLiveIntervalMs] = useState(2000);
  const [autoScroll, setAutoScroll] = useState(true);

  const [limit, setLimit] = useState(25);
  const [seqStart, setSeqStart] = useState<number | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<Array<number | undefined>>([]);
  const [loadedPayloads, setLoadedPayloads] = useState<Record<number, unknown>>({});
  const [expandedPayloads, setExpandedPayloads] = useState<Record<number, boolean>>({});
  const [payloadLoading, setPayloadLoading] = useState<Record<number, boolean>>({});
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const [compareLoading, setCompareLoading] = useState<Record<number, boolean>>({});
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const refetchRef = useRef<() => void>(() => {});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [favoriteStreams, setFavoriteStreams] = useState<string[]>([]);

  const [showHeadersCol, setShowHeadersCol] = useState(true);
  const [showSizeCol, setShowSizeCol] = useState(true);
  const [showTimeCol, setShowTimeCol] = useState(true);

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

  // Load saved views and favorites from localStorage
  useEffect(() => {
    const viewsRaw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (viewsRaw) {
      try {
        setSavedViews(JSON.parse(viewsRaw) as SavedView[]);
      } catch {
        setSavedViews([]);
      }
    }
    const favoritesRaw = localStorage.getItem(FAVORITE_STREAMS_KEY);
    if (favoritesRaw) {
      try {
        setFavoriteStreams(JSON.parse(favoritesRaw) as string[]);
      } catch {
        setFavoriteStreams([]);
      }
    }
  }, []);

  // Sync URL search params to state
  useEffect(() => {
    const streamFromQuery = searchParams.get('stream');
    const limitFromQuery = searchParams.get('limit');
    const liveFromQuery = searchParams.get('live');
    const filterSubjectFromQuery = searchParams.get('filter_subject');
    const headerKeyFromQuery = searchParams.get('header_key');
    const headerValueFromQuery = searchParams.get('header_value');
    const payloadContainsFromQuery = searchParams.get('payload_contains');

    if (streamFromQuery) setSelectedStream(streamFromQuery);
    if (limitFromQuery) setLimit(Number(limitFromQuery));
    if (liveFromQuery) setLiveMode(liveFromQuery === '1');
    if (filterSubjectFromQuery) setFilterSubject(filterSubjectFromQuery);
    if (headerKeyFromQuery) setHeaderKey(headerKeyFromQuery);
    if (headerValueFromQuery) setHeaderValue(headerValueFromQuery);
    if (payloadContainsFromQuery) setPayloadContains(payloadContainsFromQuery);
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
    if (liveMode) params.set('live', '1');
    if (filterSubject) params.set('filter_subject', filterSubject);
    if (headerKey) params.set('header_key', headerKey);
    if (headerValue) params.set('header_value', headerValue);
    if (payloadContains) params.set('payload_contains', payloadContains);
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }, [
    selectedStream,
    limit,
    liveMode,
    filterSubject,
    headerKey,
    headerValue,
    payloadContains,
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
        subjectInputRef.current?.focus();
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

  const queryParams = useMemo(
    () => ({
      limit,
      seqStart,
      fromLatest: liveMode,
      filterSubject: filterSubject || undefined,
      headerKey: headerKey || undefined,
      headerValue: headerValue || undefined,
      payloadContains: payloadContains || undefined,
      previewBytes: 2048,
    }),
    [limit, seqStart, liveMode, filterSubject, headerKey, headerValue, payloadContains],
  );

  const {
    data: messagesData,
    isLoading,
    isError,
    error: messagesError,
    refetch,
  } = useMessages(connectionId, selectedStream, queryParams, liveMode ? liveIntervalMs : false);
  refetchRef.current = refetch;
  const publishMessage = usePublishMessage(connectionId);
  const publishBatch = usePublishBatch(connectionId);
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
  const diffMessages = useMemo(
    () =>
      compareSelection
        .map((seq) => currentMessages.find((m) => m.seq === seq))
        .filter((m): m is MessageData => !!m),
    [compareSelection, currentMessages],
  );

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

  const handleSelectStream = (streamName: string) => {
    setSelectedStream(streamName);
    setSeqStart(undefined);
    setCursorHistory([]);
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
    setCursorHistory((prev) => [...prev, seqStart]);
    setSeqStart(messagesData.next_seq || undefined);
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length === 0) return;
    const previous = [...cursorHistory];
    const previousSeq = previous.pop();
    setCursorHistory(previous);
    setSeqStart(previousSeq);
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
    try {
      let payloadToReplay: unknown = loadedPayloads[message.seq];
      if (payloadToReplay === undefined) {
        const fullMessage = await messageApi.getMessage(connectionId, selectedStream, message.seq);
        payloadToReplay = fullMessage.data;
      }
      const result = await publishMessage.mutateAsync({
        subject: replaySubject.trim(),
        data: payloadToReplay,
      });
      toast.success(`Replayed seq ${message.seq} to ${replaySubject} as seq ${result.seq}.`);
    } catch (replayError) {
      toast.error(replayError instanceof Error ? replayError.message : 'Failed to replay message');
    }
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
    setSeqStart(undefined);
    setCursorHistory([]);
  };

  const toggleFavoriteStream = () => {
    if (!selectedStream) return;
    const next = favoriteStreams.includes(selectedStream)
      ? favoriteStreams.filter((s) => s !== selectedStream)
      : [...favoriteStreams, selectedStream];
    setFavoriteStreams(next);
    localStorage.setItem(FAVORITE_STREAMS_KEY, JSON.stringify(next));
  };

  const saveCurrentView = () => {
    const name = window.prompt('Save view as:');
    if (!name) return;
    const params = new URLSearchParams();
    if (selectedStream) params.set('stream', selectedStream);
    params.set('limit', String(limit));
    if (liveMode) params.set('live', '1');
    if (filterSubject) params.set('filter_subject', filterSubject);
    if (headerKey) params.set('header_key', headerKey);
    if (headerValue) params.set('header_value', headerValue);
    if (payloadContains) params.set('payload_contains', payloadContains);
    const nextViews = [
      ...savedViews.filter((v) => v.name !== name),
      { name, query: Object.fromEntries(params) },
    ];
    setSavedViews(nextViews);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(nextViews));
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
    setSeqStart(undefined);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Messages</h1>
        <p className="text-muted-foreground">
          Publish, filter, compare, replay, and monitor messages
        </p>
      </div>

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

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
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
        </div>

        <MessageList
          selectedStream={selectedStream}
          messagesData={messagesData}
          isLoading={isLoading}
          isError={isError}
          messagesError={messagesError}
          maskSensitive={maskSensitive}
          limit={limit}
          liveIntervalMs={liveIntervalMs}
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
          isPublishing={publishMessage.isPending}
          diffMessagesCount={diffMessages.length}
          listContainerRef={listContainerRef}
          onLimitChange={handleLimitChange}
          onLiveIntervalChange={setLiveIntervalMs}
          onRefetch={refetch}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          onToggleCompare={toggleCompareSelection}
          onLoadPayload={handleLoadPayload}
          onHidePayload={handleHidePayload}
          onReplayMessage={handleReplayMessage}
          onShowDiffViewer={() => setShowDiffViewer(true)}
          onFilterSubjectChange={setFilterSubject}
          onHeaderKeyChange={setHeaderKey}
          onHeaderValueChange={setHeaderValue}
          onPayloadContainsChange={setPayloadContains}
          onShowHeadersColChange={setShowHeadersCol}
          onShowSizeColChange={setShowSizeCol}
          onShowTimeColChange={setShowTimeCol}
        />
      </div>

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
