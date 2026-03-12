'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Star,
  WrapText,
} from 'lucide-react';

import { messageApi } from '@/lib/api';
import { MessageData } from '@/lib/types';
import { useConnection } from '@/contexts/ConnectionContext';
import { useMessages, usePublishBatch, usePublishMessage } from '@/hooks/useMessages';
import { useCancelJob, useJobs, useStartIndexJob } from '@/hooks/useJobs';
import { useStreams } from '@/hooks/useStreams';
import { useUiRole } from '@/hooks/useUiRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface SavedView {
  name: string;
  query: Record<string, string>;
}

type DiffCellType = 'equal' | 'added' | 'removed' | 'changed' | 'empty';

interface DiffCell {
  text: string;
  type: DiffCellType;
}

interface DiffRow {
  left: DiffCell;
  right: DiffCell;
}

interface DiffSummary {
  equal: number;
  added: number;
  removed: number;
  changed: number;
}

type DiffDisplayRow =
  | { kind: 'row'; row: DiffRow; originalIndex: number }
  | { kind: 'collapsed'; count: number };

interface DiffWorkerRequest {
  id: number;
  mode: 'line' | 'json';
  left: string;
  right: string;
}

interface DiffWorkerResponse {
  id: number;
  rows: DiffRow[];
  summary: DiffSummary;
  error?: string;
}

const SAVED_VIEWS_KEY = 'nats_saved_message_views_v1';
const FAVORITE_STREAMS_KEY = 'nats_favorite_streams_v1';

function parseHeaders(input: string): Record<string, string> | undefined {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function parsePayload(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

function formatPayload(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function maskSensitiveText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(token|api[_-]?key|password)\b\s*[:=]\s*["']?[^"',\s]+/gi, '$1:[masked]');
}

function toCsv(messages: MessageData[]): string {
  const header = ['seq', 'subject', 'payload_size', 'time'];
  const rows = messages.map((m) => [
    String(m.seq),
    JSON.stringify(m.subject ?? ''),
    String(m.payload_size ?? 0),
    JSON.stringify(m.time ?? ''),
  ]);
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function diffCellClass(type: DiffCellType): string {
  switch (type) {
    case 'added':
      return 'bg-emerald-100/70 dark:bg-emerald-900/20';
    case 'removed':
      return 'bg-rose-100/70 dark:bg-rose-900/20';
    case 'changed':
      return 'bg-amber-100/70 dark:bg-amber-900/20';
    case 'empty':
      return 'bg-muted/20';
    default:
      return 'bg-transparent';
  }
}

function collapseEqualRows(rows: DiffRow[], context = 2): DiffDisplayRow[] {
  const changedIndexes = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => !(row.left.type === 'equal' && row.right.type === 'equal'))
    .map(({ idx }) => idx);

  if (changedIndexes.length === 0) {
    return rows.map((row, idx) => ({ kind: 'row', row, originalIndex: idx }));
  }

  const keep = new Set<number>();
  for (const idx of changedIndexes) {
    for (
      let i = Math.max(0, idx - context);
      i <= Math.min(rows.length - 1, idx + context);
      i += 1
    ) {
      keep.add(i);
    }
  }

  const display: DiffDisplayRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (keep.has(i)) {
      display.push({ kind: 'row', row: rows[i], originalIndex: i });
      i += 1;
      continue;
    }

    const start = i;
    while (i < rows.length && !keep.has(i)) i += 1;
    const count = i - start;
    if (count > 0) display.push({ kind: 'collapsed', count });
  }

  return display;
}

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

  const { role, isAdmin } = useUiRole();
  const [maskSensitive, setMaskSensitive] = useState(false);

  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [payload, setPayload] = useState('{\n  "event": "example"\n}');
  const [headersInput, setHeadersInput] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [batchPayload, setBatchPayload] = useState('{"event":"one"}\n{"event":"two"}');
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
  const [diffWrap, setDiffWrap] = useState(true);
  const [diffExpanded, setDiffExpanded] = useState(true);
  const [diffMode, setDiffMode] = useState<'line' | 'json'>('line');
  const [showChangedOnly, setShowChangedOnly] = useState(true);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [diffSummary, setDiffSummary] = useState<DiffSummary>({
    equal: 0,
    added: 0,
    removed: 0,
    changed: 0,
  });
  const [diffBusy, setDiffBusy] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffScrollTop, setDiffScrollTop] = useState(0);
  const [diffViewportHeight, setDiffViewportHeight] = useState(320);
  const diffWorkerRef = useRef<Worker | null>(null);
  const diffJobIdRef = useRef(0);
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef<() => void>(() => {});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [favoriteStreams, setFavoriteStreams] = useState<string[]>([]);

  const [showHeadersCol, setShowHeadersCol] = useState(true);
  const [showSizeCol, setShowSizeCol] = useState(true);
  const [showTimeCol, setShowTimeCol] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [indexQuery, setIndexQuery] = useState('');
  const [indexLimit, setIndexLimit] = useState(2000);
  const [indexMatches, setIndexMatches] = useState<
    Array<{ seq: number; subject: string; payload_preview: string }>
  >([]);
  const [indexMeta, setIndexMeta] = useState<{
    indexed_messages: number;
    built_at?: string;
  } | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [schemaText, setSchemaText] = useState('{\n  "type": "object"\n}');
  const [schemaSeqInput, setSchemaSeqInput] = useState('');
  const [schemaResult, setSchemaResult] = useState<{ valid: boolean; errors: string[] } | null>(
    null,
  );
  const [dlqSeqInput, setDlqSeqInput] = useState('');
  const [dlqTargetSubject, setDlqTargetSubject] = useState('');
  const [toolBusy, setToolBusy] = useState(false);
  const [activeIndexJobId, setActiveIndexJobId] = useState<string | null>(null);

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

  useEffect(() => {
    if (liveMode && autoScroll && listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
    }
  }, [messagesData, liveMode, autoScroll]);

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLastResult(null);

    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }

    const headers = parseHeaders(headersInput);
    try {
      if (batchMode) {
        const messages = batchPayload
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => parsePayload(line));
        if (messages.length === 0) {
          setError('Add at least one message line for batch publish.');
          return;
        }
        const result = await publishBatch.mutateAsync({
          subject: subject.trim(),
          messages,
          headers,
        });
        setLastResult(`Published ${result.published} messages.`);
      } else {
        const result = await publishMessage.mutateAsync({
          subject: subject.trim(),
          data: parsePayload(payload),
          headers,
        });
        setLastResult(`Published to stream ${result.stream}, sequence ${result.seq}.`);
      }
      await refetch();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Failed to publish message');
    }
  };

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
      setError(loadError instanceof Error ? loadError.message : 'Failed to load full payload');
    } finally {
      setPayloadLoading((prev) => ({ ...prev, [seq]: false }));
    }
  };

  const handleHidePayload = (seq: number) => {
    setExpandedPayloads((prev) => ({ ...prev, [seq]: false }));
  };

  const handleReplayMessage = async (message: MessageData) => {
    if (!isAdmin) return;
    if (!connectionId || !selectedStream || !replaySubject.trim()) {
      setError('Replay subject is required.');
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
      setLastResult(`Replayed seq ${message.seq} to ${replaySubject} as seq ${result.seq}.`);
    } catch (replayError) {
      setError(replayError instanceof Error ? replayError.message : 'Failed to replay message');
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

  const currentMessages = useMemo(() => messagesData?.messages ?? [], [messagesData?.messages]);
  const diffMessages = useMemo(
    () =>
      compareSelection
        .map((seq) => currentMessages.find((m) => m.seq === seq))
        .filter((m): m is MessageData => !!m),
    [compareSelection, currentMessages],
  );

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

  useEffect(() => {
    if (diffMessages.length !== 2) {
      setShowDiffViewer(false);
    }
  }, [diffMessages.length]);

  useEffect(() => {
    if (!showDiffViewer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showDiffViewer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const worker = new Worker(new URL('../../../workers/diff.worker.ts', import.meta.url));
    diffWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
      const payload = event.data;
      if (payload.id !== diffJobIdRef.current) return;
      setDiffRows(payload.rows);
      setDiffSummary(payload.summary);
      if (payload.error) {
        setError(payload.error);
      }
      setDiffBusy(false);
    };

    worker.onerror = () => {
      setDiffBusy(false);
      setError('Diff worker failed');
    };

    return () => {
      worker.terminate();
      diffWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (diffMessages.length !== 2 || !showDiffViewer) {
      setDiffRows((prev) => (prev.length === 0 ? prev : []));
      setDiffSummary((prev) =>
        prev.equal === 0 && prev.added === 0 && prev.removed === 0 && prev.changed === 0
          ? prev
          : { equal: 0, added: 0, removed: 0, changed: 0 },
      );
      setDiffBusy(false);
      return;
    }

    const leftMessage = diffMessages[0];
    const rightMessage = diffMessages[1];
    const leftBase = Object.prototype.hasOwnProperty.call(loadedPayloads, leftMessage.seq)
      ? formatPayload(loadedPayloads[leftMessage.seq])
      : leftMessage.data !== undefined
        ? formatPayload(leftMessage.data)
        : formatPayload(leftMessage.data_preview ?? '');
    const rightBase = Object.prototype.hasOwnProperty.call(loadedPayloads, rightMessage.seq)
      ? formatPayload(loadedPayloads[rightMessage.seq])
      : rightMessage.data !== undefined
        ? formatPayload(rightMessage.data)
        : formatPayload(rightMessage.data_preview ?? '');
    const left = maskSensitive ? maskSensitiveText(leftBase) : leftBase;
    const right = maskSensitive ? maskSensitiveText(rightBase) : rightBase;
    const worker = diffWorkerRef.current;
    if (!worker) return;

    const id = diffJobIdRef.current + 1;
    diffJobIdRef.current = id;
    setDiffBusy(true);
    const request: DiffWorkerRequest = { id, mode: diffMode, left, right };
    worker.postMessage(request);
  }, [diffMessages, loadedPayloads, diffMode, maskSensitive, showDiffViewer]);

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

  const toggleFavoriteStream = () => {
    if (!selectedStream) return;
    const next = favoriteStreams.includes(selectedStream)
      ? favoriteStreams.filter((s) => s !== selectedStream)
      : [...favoriteStreams, selectedStream];
    setFavoriteStreams(next);
    localStorage.setItem(FAVORITE_STREAMS_KEY, JSON.stringify(next));
  };

  const exportJson = () => {
    downloadFile('messages.json', JSON.stringify(currentMessages, null, 2), 'application/json');
  };

  const exportCsv = () => {
    downloadFile('messages.csv', toCsv(currentMessages), 'text/csv');
  };

  const handleBuildIndex = async () => {
    if (!connectionId || !selectedStream) return;
    setIndexLoading(true);
    setError(null);
    try {
      const job = await startIndexJob.mutateAsync({
        streamName: selectedStream,
        limit: indexLimit,
      });
      setActiveIndexJobId(job.id);
      setLastResult(`Started background index job ${job.id.slice(0, 8)}…`);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : 'Failed to build message index');
    } finally {
      setIndexLoading(false);
    }
  };

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
      setLastResult(`Index build completed (${indexed} messages).`);
      setActiveIndexJobId(null);
    } else if (activeIndexJob.status === 'failed') {
      setError(activeIndexJob.error || 'Index build failed');
      setActiveIndexJobId(null);
    } else if (activeIndexJob.status === 'cancelled') {
      setLastResult('Index build cancelled.');
      setActiveIndexJobId(null);
    }
  }, [activeIndexJob]);

  const handleSearchIndex = async () => {
    if (!connectionId || !selectedStream || !indexQuery.trim()) return;
    setIndexLoading(true);
    setError(null);
    try {
      const result = await messageApi.searchIndex(
        connectionId,
        selectedStream,
        indexQuery.trim(),
        100,
      );
      setIndexMatches(result.matches || []);
      setIndexMeta({ indexed_messages: result.indexed_messages, built_at: result.built_at });
      setLastResult(`Indexed search returned ${result.total} matches.`);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : 'Failed to search message index',
      );
    } finally {
      setIndexLoading(false);
    }
  };

  const resolveMessagePayloadBySeq = async (seq: number): Promise<unknown> => {
    const existing = loadedPayloads[seq];
    if (existing !== undefined) return existing;
    const inPage = currentMessages.find((m) => m.seq === seq);
    if (inPage?.data !== undefined) return inPage.data;
    if (!connectionId || !selectedStream) throw new Error('Connection and stream required');
    const full = await messageApi.getMessage(connectionId, selectedStream, seq);
    setLoadedPayloads((prev) => ({ ...prev, [seq]: full.data }));
    return full.data;
  };

  const handleValidateSchema = async () => {
    if (!connectionId) return;
    const seq = Number(schemaSeqInput || compareSelection[0]);
    if (!Number.isFinite(seq) || seq <= 0) {
      setError('Provide a valid sequence number for schema validation.');
      return;
    }

    let parsedSchema: unknown;
    try {
      parsedSchema = JSON.parse(schemaText);
    } catch {
      setError('Schema must be valid JSON.');
      return;
    }

    setToolBusy(true);
    setError(null);
    try {
      const payloadToValidate = await resolveMessagePayloadBySeq(seq);
      const result = await messageApi.validateSchema(connectionId, parsedSchema, payloadToValidate);
      setSchemaResult(result);
      setLastResult(
        result.valid ? `Seq ${seq} is schema-valid.` : `Seq ${seq} failed schema validation.`,
      );
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : 'Schema validation failed',
      );
    } finally {
      setToolBusy(false);
    }
  };

  const handleDlqReplay = async () => {
    if (!isAdmin || !connectionId || !selectedStream) return;
    const seq = Number(dlqSeqInput || compareSelection[0]);
    if (!Number.isFinite(seq) || seq <= 0) {
      setError('Provide a valid source sequence for DLQ replay.');
      return;
    }
    if (!dlqTargetSubject.trim()) {
      setError('Target subject is required for DLQ replay.');
      return;
    }

    setToolBusy(true);
    setError(null);
    try {
      const replay = await messageApi.replay(connectionId, selectedStream, seq, {
        target_subject: dlqTargetSubject.trim(),
        copy_headers: true,
        extra_headers: { 'x-replayed-from-seq': String(seq) },
      });
      setLastResult(
        `Replayed seq ${replay.source_seq} to ${replay.target_subject} as seq ${replay.published_seq}.`,
      );
      await refetch();
    } catch (replayError) {
      setError(replayError instanceof Error ? replayError.message : 'DLQ replay failed');
    } finally {
      setToolBusy(false);
    }
  };

  const renderPayload = (message: MessageData): string => {
    const base =
      expandedPayloads[message.seq] &&
      Object.prototype.hasOwnProperty.call(loadedPayloads, message.seq)
        ? formatPayload(loadedPayloads[message.seq])
        : formatPayload(message.data_preview ?? '');
    return maskSensitive ? maskSensitiveText(base) : base;
  };

  const displayDiffRows = useMemo(
    () =>
      showChangedOnly
        ? collapseEqualRows(diffRows)
        : diffRows.map((row, originalIndex) => ({ kind: 'row' as const, row, originalIndex })),
    [diffRows, showChangedOnly],
  );

  useEffect(() => {
    const el = diffContainerRef.current;
    if (!el) return;

    const updateHeight = () => {
      setDiffViewportHeight(el.clientHeight || 320);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [diffExpanded, diffWrap, displayDiffRows.length, showDiffViewer]);

  useEffect(() => {
    setDiffScrollTop(0);
    if (diffContainerRef.current) diffContainerRef.current.scrollTop = 0;
  }, [diffMessages, diffWrap, showChangedOnly, diffMode, showDiffViewer]);

  const handleDiffScroll = () => {
    if (!diffContainerRef.current) return;
    setDiffScrollTop(diffContainerRef.current.scrollTop);
  };

  const rowHeight = 24;
  const overscan = 20;
  const totalDiffRows = displayDiffRows.length;
  const visibleStart = diffWrap ? 0 : Math.max(0, Math.floor(diffScrollTop / rowHeight) - overscan);
  const visibleCount = diffWrap
    ? totalDiffRows
    : Math.ceil(diffViewportHeight / rowHeight) + overscan * 2;
  const visibleEnd = diffWrap
    ? totalDiffRows
    : Math.min(totalDiffRows, visibleStart + visibleCount);
  const visibleDiffRows = diffWrap
    ? displayDiffRows
    : displayDiffRows.slice(visibleStart, visibleEnd);
  const topSpacerHeight = diffWrap ? 0 : visibleStart * rowHeight;
  const bottomSpacerHeight = diffWrap ? 0 : Math.max(0, (totalDiffRows - visibleEnd) * rowHeight);
  const canShowDiffViewer = showDiffViewer && diffMessages.length === 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Messages</h1>
        <p className="text-muted-foreground">
          Publish, filter, compare, replay, and monitor messages
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">View Controls</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} disabled>
              <option value="admin">admin</option>
              <option value="viewer">viewer</option>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label>Saved Views</Label>
            <div className="flex gap-2">
              <Select
                defaultValue=""
                onChange={(e) => e.target.value && applySavedView(e.target.value)}
              >
                <option value="">Select a saved view</option>
                {savedViews.map((view) => (
                  <option key={view.name} value={view.name}>
                    {view.name}
                  </option>
                ))}
              </Select>
              <Button variant="outline" onClick={saveCurrentView}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1 lg:col-span-3">
            <Label>Quick Toggles</Label>
            <div className="flex items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={liveMode} onChange={(e) => setLiveMode(e.target.checked)} />
                Live tail
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                Auto-scroll
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={maskSensitive}
                  onChange={(e) => setMaskSensitive(e.target.checked)}
                />
                Mask sensitive
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <form onSubmit={handlePublish}>
              <CardHeader>
                <CardTitle className="text-lg">Publish Message</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block space-y-1">
                  <Label>Stream</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedStream || ''}
                      onChange={(event) => handleSelectStream(event.target.value)}
                      disabled={streamNames.length === 0}
                    >
                      {streamNames.length === 0 ? (
                        <option value="">No streams available</option>
                      ) : (
                        streamNames.map((streamName) => (
                          <option key={streamName} value={streamName}>
                            {streamName}
                          </option>
                        ))
                      )}
                    </Select>
                    <Button
                      variant="outline"
                      onClick={toggleFavoriteStream}
                      type="button"
                      disabled={!selectedStream}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          selectedStream && favoriteStreams.includes(selectedStream)
                            ? 'fill-yellow-400 text-yellow-500'
                            : ''
                        }`}
                      />
                    </Button>
                  </div>
                </label>

                {favoriteStreams.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {favoriteStreams.map((stream) => (
                      <Button
                        key={stream}
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSelectStream(stream)}
                        type="button"
                      >
                        {stream}
                      </Button>
                    ))}
                  </div>
                )}

                <label className="block space-y-1">
                  <Label>Subject</Label>
                  <Input
                    ref={subjectInputRef}
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="orders.created"
                  />
                </label>

                <label className="block space-y-1">
                  <Label>Replay Subject</Label>
                  <Input
                    type="text"
                    value={replaySubject}
                    onChange={(event) => setReplaySubject(event.target.value)}
                    placeholder="orders.replay"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="batchMode"
                    checked={batchMode}
                    onChange={(event) => setBatchMode(event.target.checked)}
                  />
                  <Label htmlFor="batchMode" className="text-sm font-normal">
                    Batch mode (one message per line)
                  </Label>
                </div>

                {batchMode ? (
                  <label className="block space-y-1">
                    <Label>Batch Payload</Label>
                    <Textarea
                      value={batchPayload}
                      onChange={(event) => setBatchPayload(event.target.value)}
                      rows={6}
                      className="font-mono"
                    />
                  </label>
                ) : (
                  <label className="block space-y-1">
                    <Label>Payload</Label>
                    <Textarea
                      value={payload}
                      onChange={(event) => setPayload(event.target.value)}
                      rows={6}
                      className="font-mono"
                    />
                  </label>
                )}

                <label className="block space-y-1">
                  <Label>Headers (optional)</Label>
                  <Textarea
                    value={headersInput}
                    onChange={(event) => setHeadersInput(event.target.value)}
                    rows={3}
                    placeholder={'Nats-Msg-Id: msg-123\nContent-Type: application/json'}
                    className="font-mono"
                  />
                </label>

                {error && <p className="text-sm text-destructive">{error}</p>}
                {lastResult && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">{lastResult}</p>
                )}

                <Button
                  type="submit"
                  disabled={
                    !connectionId ||
                    !selectedStream ||
                    publishMessage.isPending ||
                    publishBatch.isPending
                  }
                  className="w-full"
                >
                  <Plus className="w-4 h-4" />
                  {publishMessage.isPending || publishBatch.isPending
                    ? 'Publishing...'
                    : batchMode
                      ? 'Publish Batch'
                      : 'Publish Message'}
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Advanced Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Indexed Search</Label>
                <div className="flex gap-2">
                  <Input
                    value={indexQuery}
                    onChange={(e) => setIndexQuery(e.target.value)}
                    placeholder="Search subject/header/payload preview"
                  />
                  <Button
                    variant="outline"
                    onClick={handleSearchIndex}
                    disabled={!selectedStream || indexLoading}
                  >
                    Search
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={100}
                    max={10000}
                    value={indexLimit}
                    onChange={(e) => setIndexLimit(Number(e.target.value))}
                  />
                  <Button
                    variant="outline"
                    onClick={handleBuildIndex}
                    disabled={!isAdmin || !selectedStream || indexLoading}
                  >
                    Build Index
                  </Button>
                </div>
                {activeIndexJob && (
                  <div className="rounded border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Index Job: {activeIndexJob.status}</span>
                      {(activeIndexJob.status === 'pending' ||
                        activeIndexJob.status === 'running') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelJob.mutate(activeIndexJob.id)}
                          disabled={cancelJob.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${activeIndexJob.progress}%` }}
                      />
                    </div>
                    <div className="text-muted-foreground">
                      {activeIndexJob.current ?? 0}/{activeIndexJob.total ?? 0}
                      {activeIndexJob.message ? ` | ${activeIndexJob.message}` : ''}
                    </div>
                  </div>
                )}
                {indexMeta && (
                  <p className="text-xs text-muted-foreground">
                    Indexed: {indexMeta.indexed_messages}
                    {indexMeta.built_at
                      ? ` | built ${new Date(indexMeta.built_at).toLocaleString()}`
                      : ''}
                  </p>
                )}
                {indexMatches.length > 0 && (
                  <div className="max-h-44 overflow-auto border rounded divide-y text-xs">
                    {indexMatches.slice(0, 10).map((m) => (
                      <div key={m.seq} className="p-2">
                        <div className="font-medium">
                          {m.subject} (seq {m.seq})
                        </div>
                        <div className="text-muted-foreground line-clamp-2">
                          {m.payload_preview}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>DLQ Replay</Label>
                <Input
                  type="number"
                  min={1}
                  value={dlqSeqInput}
                  onChange={(e) => setDlqSeqInput(e.target.value)}
                  placeholder={`Source seq (defaults to selected: ${compareSelection[0] ?? '-'})`}
                />
                <Input
                  value={dlqTargetSubject}
                  onChange={(e) => setDlqTargetSubject(e.target.value)}
                  placeholder="Target subject (e.g. orders.retry)"
                />
                <Button
                  onClick={handleDlqReplay}
                  disabled={!isAdmin || toolBusy || !selectedStream}
                >
                  Replay to Target
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Schema Validation (JSON Schema subset)</Label>
                <Input
                  type="number"
                  min={1}
                  value={schemaSeqInput}
                  onChange={(e) => setSchemaSeqInput(e.target.value)}
                  placeholder={`Seq to validate (defaults to selected: ${compareSelection[0] ?? '-'})`}
                />
                <Textarea
                  value={schemaText}
                  onChange={(e) => setSchemaText(e.target.value)}
                  rows={5}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={handleValidateSchema}
                  disabled={toolBusy || !connectionId}
                >
                  Validate Payload
                </Button>
                {schemaResult && (
                  <div
                    className={`text-xs rounded border p-2 ${schemaResult.valid ? 'text-emerald-600' : 'text-destructive'}`}
                  >
                    {schemaResult.valid ? 'Valid payload' : schemaResult.errors.join(' | ')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {diffMessages.length === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Diff Compare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Selected seq {diffMessages[0].seq} and seq {diffMessages[1].seq}
                </div>
                {(compareLoading[diffMessages[0].seq] || compareLoading[diffMessages[1].seq]) && (
                  <div className="text-xs text-muted-foreground">
                    Loading full payloads for diff…
                  </div>
                )}
                <Button size="sm" onClick={() => setShowDiffViewer(true)}>
                  Open Diff Viewer
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="xl:col-span-3 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg">
                Recent Messages {selectedStream ? `(${selectedStream})` : ''}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(limit)}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setSeqStart(undefined);
                    setCursorHistory([]);
                  }}
                  className="w-20"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Select>
                <Select
                  value={String(liveIntervalMs)}
                  onChange={(e) => setLiveIntervalMs(Number(e.target.value))}
                  className="w-24"
                >
                  <option value={1000}>1s</option>
                  <option value={2000}>2s</option>
                  <option value={5000}>5s</option>
                </Select>
                <Button
                  onClick={() => refetch()}
                  disabled={!selectedStream}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
                <Button
                  onClick={handlePreviousPage}
                  disabled={cursorHistory.length === 0}
                  variant="outline"
                  size="sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button
                  onClick={handleNextPage}
                  disabled={!messagesData?.has_more || !messagesData?.next_seq}
                  variant="outline"
                  size="sm"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={exportJson}>
                  <Download className="w-4 h-4" />
                  JSON
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="w-4 h-4" />
                  CSV
                </Button>
                <Button
                  variant={diffMessages.length === 2 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowDiffViewer(true)}
                  disabled={diffMessages.length !== 2}
                >
                  Diff View
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
              <Input
                placeholder="Filter subject (e.g. orders.*)"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              />
              <Input
                placeholder="Header key"
                value={headerKey}
                onChange={(e) => setHeaderKey(e.target.value)}
              />
              <Input
                placeholder="Header value"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
              />
              <Input
                placeholder="Payload contains"
                value={payloadContains}
                onChange={(e) => setPayloadContains(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={showHeadersCol}
                  onChange={(e) => setShowHeadersCol(e.target.checked)}
                />
                Headers
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={showSizeCol}
                  onChange={(e) => setShowSizeCol(e.target.checked)}
                />
                Size
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={showTimeCol}
                  onChange={(e) => setShowTimeCol(e.target.checked)}
                />
                Time
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedStream ? (
              <div className="p-8 text-center text-muted-foreground">
                Select or create a stream to view messages.
              </div>
            ) : isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading messages...</div>
            ) : isError ? (
              <div className="p-8 text-center text-destructive">
                Failed to load messages:{' '}
                {messagesError instanceof Error ? messagesError.message : 'Unknown error'}
              </div>
            ) : currentMessages.length > 0 ? (
              <div ref={listContainerRef} className="max-h-[740px] overflow-y-auto divide-y">
                {currentMessages.map((message: MessageData) => (
                  <div key={message.seq} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={compareSelection.includes(message.seq)}
                          onChange={() => toggleCompareSelection(message.seq)}
                        />
                        <span className="font-medium">{message.subject}</span>
                        <span className="text-xs text-muted-foreground">seq {message.seq}</span>
                      </div>
                      {showTimeCol && (
                        <span className="text-xs text-muted-foreground">
                          {message.time ? new Date(message.time).toLocaleString() : '-'}
                        </span>
                      )}
                    </div>

                    <pre className="text-xs bg-muted/40 border rounded p-3 overflow-x-auto">
                      {renderPayload(message)}
                    </pre>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {showSizeCol && <>Size: {message.payload_size ?? 0} bytes</>}
                        {showHeadersCol &&
                          message.headers &&
                          Object.keys(message.headers).length > 0 && (
                            <>
                              {' '}
                              | Headers:{' '}
                              {Object.entries(message.headers)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' | ')}
                            </>
                          )}
                      </div>
                      <div className="flex items-center gap-2">
                        {expandedPayloads[message.seq] ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleHidePayload(message.seq)}
                          >
                            <EyeOff className="w-4 h-4" />
                            Hide
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleLoadPayload(message.seq)}
                            disabled={payloadLoading[message.seq]}
                          >
                            <Eye className="w-4 h-4" />
                            {payloadLoading[message.seq]
                              ? 'Loading...'
                              : Object.prototype.hasOwnProperty.call(loadedPayloads, message.seq)
                                ? 'Show'
                                : 'Load'}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReplayMessage(message)}
                          disabled={!isAdmin || publishMessage.isPending}
                        >
                          <Play className="w-4 h-4" />
                          Replay
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No messages found for current filters.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canShowDiffViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDiffViewer(false)} />
          <div className="relative z-10 w-full max-w-7xl rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">Diff Viewer</h2>
                <p className="text-xs text-muted-foreground">
                  Comparing seq {diffMessages[0].seq} vs seq {diffMessages[1].seq}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowDiffViewer(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setDiffWrap((v) => !v)}>
                  <WrapText className="w-4 h-4" />
                  {diffWrap ? 'No Wrap' : 'Wrap'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDiffExpanded((v) => !v)}>
                  {diffExpanded ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                  {diffExpanded ? 'Compact' : 'Expanded'}
                </Button>
                <Select
                  value={diffMode}
                  onChange={(event) => setDiffMode(event.target.value as 'line' | 'json')}
                  className="w-28"
                >
                  <option value="line">Line</option>
                  <option value="json">JSON path</option>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={showChangedOnly}
                    onChange={(e) => setShowChangedOnly(e.target.checked)}
                  />
                  Changed only
                </label>
                {diffBusy && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Computing diff...
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-muted px-2 py-1">Changed: {diffSummary.changed}</span>
                <span className="rounded bg-emerald-100/70 px-2 py-1">
                  Added: {diffSummary.added}
                </span>
                <span className="rounded bg-rose-100/70 px-2 py-1">
                  Removed: {diffSummary.removed}
                </span>
                <span className="rounded bg-muted px-2 py-1">Equal: {diffSummary.equal}</span>
              </div>

              {(compareLoading[diffMessages[0].seq] || compareLoading[diffMessages[1].seq]) && (
                <div className="text-xs text-muted-foreground">Loading full payloads for diff…</div>
              )}

              <div className="overflow-hidden rounded border text-xs">
                <div className="grid grid-cols-2 border-b bg-muted/40 font-medium">
                  <div className="px-3 py-2">Seq {diffMessages[0].seq}</div>
                  <div className="px-3 py-2 border-l">Seq {diffMessages[1].seq}</div>
                </div>
                <div
                  ref={diffContainerRef}
                  onScroll={handleDiffScroll}
                  className={`${diffExpanded ? 'max-h-[72vh]' : 'max-h-72'} overflow-auto font-mono`}
                >
                  {!diffWrap && topSpacerHeight > 0 && (
                    <div style={{ height: `${topSpacerHeight}px` }} />
                  )}
                  {visibleDiffRows.map((display, idx) => {
                    if (display.kind === 'collapsed') {
                      return (
                        <div
                          key={`collapsed-${visibleStart + idx}`}
                          className="px-3 h-6 leading-6 text-[10px] text-muted-foreground bg-muted/20"
                        >
                          ... {display.count} unchanged lines hidden ...
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`row-${display.originalIndex}`}
                        className={`grid grid-cols-2 ${diffWrap ? '' : 'h-6'}`}
                      >
                        <div
                          className={`px-3 ${diffWrap ? 'py-0.5 whitespace-pre-wrap break-all' : 'leading-6 whitespace-pre'} ${diffCellClass(display.row.left.type)}`}
                        >
                          <span className="inline-block w-10 text-[10px] text-muted-foreground mr-2 select-none">
                            {display.originalIndex + 1}
                          </span>
                          {display.row.left.text || ' '}
                        </div>
                        <div
                          className={`px-3 border-l ${diffWrap ? 'py-0.5 whitespace-pre-wrap break-all' : 'leading-6 whitespace-pre'} ${diffCellClass(display.row.right.type)}`}
                        >
                          <span className="inline-block w-10 text-[10px] text-muted-foreground mr-2 select-none">
                            {display.originalIndex + 1}
                          </span>
                          {display.row.right.text || ' '}
                        </div>
                      </div>
                    );
                  })}
                  {!diffWrap && bottomSpacerHeight > 0 && (
                    <div style={{ height: `${bottomSpacerHeight}px` }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
