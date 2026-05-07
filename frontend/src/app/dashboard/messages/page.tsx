'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { messageApi } from '@/lib/api';
import { MessageData } from '@/lib/types';
import { copyText } from '@/lib/download';
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
import { formatPayload } from '@/components/messages/utils';
import { usePrompt } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

const SAVED_VIEWS_KEY = 'nats_saved_message_views_v1';
const FAVORITE_STREAMS_KEY = 'nats_favorite_streams_v1';
const MESSAGE_BOOKMARKS_KEY = 'nats_message_bookmarks_v1';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export default function MessagesPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const { connectionId } = useConnection();
  const prompt = usePrompt();
  const { data: streamsData } = useStreams(connectionId);
  const streamNames = useMemo(
    () => (streamsData?.streams || []).map((stream) => stream.config.name),
    [streamsData?.streams],
  );

  const [workspaceMode, setWorkspaceMode] = useState<'browse' | 'publish' | 'tools'>('browse');
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
  const [messageBookmarks, setMessageBookmarks] = useState<Record<string, number[]>>({});

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
    const bookmarksRaw = localStorage.getItem(MESSAGE_BOOKMARKS_KEY);
    if (bookmarksRaw) {
      try {
        setMessageBookmarks(JSON.parse(bookmarksRaw) as Record<string, number[]>);
      } catch {
        setMessageBookmarks({});
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
    const seqStartFromQuery = searchParams.get('seq_start');

    if (streamFromQuery) setSelectedStream(streamFromQuery);
    if (limitFromQuery) setLimit(Number(limitFromQuery));
    if (liveFromQuery) setLiveMode(liveFromQuery === '1');
    if (filterSubjectFromQuery) setFilterSubject(filterSubjectFromQuery);
    if (headerKeyFromQuery) setHeaderKey(headerKeyFromQuery);
    if (headerValueFromQuery) setHeaderValue(headerValueFromQuery);
    if (payloadContainsFromQuery) setPayloadContains(payloadContainsFromQuery);
    if (seqStartFromQuery) setSeqStart(Number(seqStartFromQuery));
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
    if (seqStart) params.set('seq_start', String(seqStart));
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }, [
    selectedStream,
    limit,
    liveMode,
    filterSubject,
    headerKey,
    headerValue,
    payloadContains,
    seqStart,
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

  const handleFirstPage = () => {
    setCursorHistory([]);
    setSeqStart(undefined);
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
    const targetSeq = Math.round(first_seq + ((page - 1) / totalPages) * seqRange);
    const clampedSeq = Math.max(first_seq, Math.min(targetSeq, last_seq));
    // Build a synthetic cursor history so "Prev" goes back to page 1
    const history: Array<number | undefined> = [undefined];
    for (let p = 2; p < page; p++) {
      const hSeq = Math.round(first_seq + ((p - 1) / totalPages) * seqRange);
      history.push(Math.max(first_seq, Math.min(hSeq, last_seq)));
    }
    setCursorHistory(history);
    setSeqStart(clampedSeq);
  };

  const handleGoToSequence = (seq: number) => {
    setLiveMode(false);
    setCursorHistory([]);
    setSeqStart(seq);
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
      const next = { ...prev, [selectedStream]: nextForStream };
      localStorage.setItem(MESSAGE_BOOKMARKS_KEY, JSON.stringify(next));
      return next;
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
    setSeqStart(q.seq_start ? Number(q.seq_start) : undefined);
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

  const renderMessageList = (className?: string) => (
    <MessageList
      className={className}
      selectedStream={selectedStream}
      messagesData={messagesData}
      isLoading={isLoading}
      isError={isError}
      messagesError={messagesError}
      maskSensitive={maskSensitive}
      liveMode={liveMode}
      limit={limit}
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
      isPublishing={publishMessage.isPending}
      diffMessagesCount={diffMessages.length}
      listContainerRef={listContainerRef}
      onLimitChange={handleLimitChange}
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
      onShowDiffViewer={() => setShowDiffViewer(true)}
      onFilterSubjectChange={setFilterSubject}
      onHeaderKeyChange={setHeaderKey}
      onHeaderValueChange={setHeaderValue}
      onPayloadContainsChange={setPayloadContains}
      onShowHeadersColChange={setShowHeadersCol}
      onShowSizeColChange={setShowSizeCol}
      onShowTimeColChange={setShowTimeCol}
    />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Messages"
        description="Publish, filter, compare, replay, and monitor messages"
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
        onValueChange={(value) => setWorkspaceMode(value as typeof workspaceMode)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="publish">Publish</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
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
            <ResizablePanel defaultSize={40} minSize={28}>
              <div className="pr-3">{renderPublishPanel()}</div>
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={60} minSize={36}>
              <div className="pl-3">{renderMessageList()}</div>
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
            <ResizablePanel defaultSize={40} minSize={28}>
              <div className="space-y-6 pr-3">{renderToolsPanel()}</div>
            </ResizablePanel>
            <ResizableHandle withHandle className="mx-1" />
            <ResizablePanel defaultSize={60} minSize={36}>
              <div className="pl-3">{renderMessageList()}</div>
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
