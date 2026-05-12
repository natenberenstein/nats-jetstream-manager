'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GitBranch,
  Hash,
  Inbox,
  KeyRound,
  ListRestart,
  Pause,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';

import { ConsumerInfo, MessageData, MessagesResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { subjectMatches } from '@/lib/subject-analysis';
import { MessageDatePreset } from '@/components/messages/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SubjectChip } from '@/components/subjects/SubjectChips';
import { downloadFile, formatPayload, maskSensitiveText, toCsv } from './utils';
import { PayloadViewer } from './PayloadViewer';

interface MessageStatusSummary {
  label: string;
  title: string;
  icon: typeof Inbox;
  className: string;
}

function getConsumerMessageState(
  consumer: ConsumerInfo,
  message: MessageData,
): 'pending' | 'acknowledged' | 'not_acknowledged' | 'no_ack' {
  const ackPolicy = consumer.config.ack_policy ?? 'explicit';
  if (ackPolicy === 'none') return 'no_ack';
  if (message.seq <= (consumer.ack_floor?.stream_seq ?? 0)) return 'acknowledged';
  if (message.seq <= (consumer.delivered?.stream_seq ?? 0)) return 'not_acknowledged';
  return 'pending';
}

function getMessageStatus(message: MessageData, consumers: ConsumerInfo[]): MessageStatusSummary {
  const matchingConsumers = consumers.filter((consumer) => {
    const filterSubject = consumer.config.filter_subject;
    return !filterSubject || subjectMatches(filterSubject, message.subject);
  });

  if (matchingConsumers.length === 0) {
    return {
      label: 'Stored',
      title: 'Stored in the stream. No matching consumer status is available.',
      icon: Inbox,
      className:
        'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900/20 dark:text-slate-300',
    };
  }

  const counts = matchingConsumers.reduce(
    (acc, consumer) => {
      const state = getConsumerMessageState(consumer, message);
      acc[state] += 1;
      return acc;
    },
    { acknowledged: 0, not_acknowledged: 0, pending: 0, no_ack: 0 },
  );
  const details = [
    `${counts.acknowledged} acknowledged`,
    `${counts.not_acknowledged} not acknowledged`,
    `${counts.pending} pending`,
    `${counts.no_ack} no ack required`,
  ].join(', ');
  const title = `Inferred from ${matchingConsumers.length} matching consumer${matchingConsumers.length === 1 ? '' : 's'}: ${details}.`;

  if (counts.not_acknowledged > 0) {
    return {
      label: counts.pending > 0 ? 'Mixed' : 'Not acknowledged',
      title,
      icon: AlertTriangle,
      className: 'border-warning/50 bg-warning/10 text-warning-foreground',
    };
  }

  if (counts.pending > 0) {
    return {
      label: counts.acknowledged > 0 || counts.no_ack > 0 ? 'Mixed' : 'Pending',
      title,
      icon: Clock3,
      className:
        'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
    };
  }

  if (counts.acknowledged > 0) {
    return {
      label: counts.no_ack > 0 ? 'Mixed' : 'Acknowledged',
      title,
      icon: CheckCircle2,
      className: 'border-success/50 bg-success/10 text-success-foreground',
    };
  }

  return {
    label: 'No ack required',
    title,
    icon: CheckCircle2,
    className: 'border-success/50 bg-success/10 text-success-foreground',
  };
}

type MessageFilterKey = 'subject' | 'payload' | 'header' | 'date' | 'sequence';

function parseSequenceInput(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateRangeLabel(range: DateRange | undefined): string {
  if (!range?.from) return 'Select a date range';
  if (!range.to || isSameCalendarDay(range.from, range.to)) {
    return format(range.from, 'LLL d, y');
  }
  return `${format(range.from, 'LLL d, y')} - ${format(range.to, 'LLL d, y')}`;
}

function JumpToSequenceControl({
  selectedStream,
  firstSeq,
  lastSeq,
  onGoToSequence,
}: {
  selectedStream: string | null;
  firstSeq?: number;
  lastSeq?: number;
  onGoToSequence: (seq: number) => void;
}) {
  const [jumpSeq, setJumpSeq] = useState('');
  const seq = jumpSeq ? Number(jumpSeq) : undefined;
  const isOutOfRange =
    seq !== undefined &&
    ((firstSeq !== undefined && seq < firstSeq) || (lastSeq !== undefined && seq > lastSeq));
  const canSubmit = Boolean(
    selectedStream && seq !== undefined && Number.isSafeInteger(seq) && seq > 0 && !isOutOfRange,
  );

  return (
    <div className="space-y-2">
      <Label>Jump to sequence</Label>
      <div className="flex gap-2">
        <Input
          value={jumpSeq}
          onChange={(event) => setJumpSeq(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Sequence"
          aria-invalid={isOutOfRange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (canSubmit && seq !== undefined) onGoToSequence(seq);
          }}
          disabled={!canSubmit}
        >
          Go
        </Button>
      </div>
      {isOutOfRange && (
        <p className="text-xs text-destructive">
          Enter a sequence between {firstSeq ?? 1} and {lastSeq ?? 'the latest'}.
        </p>
      )}
    </div>
  );
}

function SequenceRangeControl({
  selectedStream,
  seqStart,
  seqEnd,
  firstSeq,
  lastSeq,
  onSequenceRangeChange,
  onClearSequenceFilter,
}: {
  selectedStream: string | null;
  seqStart: number | undefined;
  seqEnd: number | undefined;
  firstSeq?: number;
  lastSeq?: number;
  onSequenceRangeChange: (start: number | undefined, end: number | undefined) => void;
  onClearSequenceFilter: () => void;
}) {
  const [startValue, setStartValue] = useState(seqStart ? String(seqStart) : '');
  const [endValue, setEndValue] = useState(seqEnd ? String(seqEnd) : '');

  useEffect(() => {
    setStartValue(seqStart ? String(seqStart) : '');
  }, [seqStart]);

  useEffect(() => {
    setEndValue(seqEnd ? String(seqEnd) : '');
  }, [seqEnd]);

  const parsedStart = startValue ? parseSequenceInput(startValue) : undefined;
  const parsedEnd = endValue ? parseSequenceInput(endValue) : undefined;
  const hasInvalidStart = Boolean(startValue && parsedStart === undefined);
  const hasInvalidEnd = Boolean(endValue && parsedEnd === undefined);
  const isReversed =
    parsedStart !== undefined && parsedEnd !== undefined && parsedStart > parsedEnd;
  const isOutOfRange =
    (parsedStart !== undefined &&
      ((firstSeq !== undefined && parsedStart < firstSeq) ||
        (lastSeq !== undefined && parsedStart > lastSeq))) ||
    (parsedEnd !== undefined &&
      ((firstSeq !== undefined && parsedEnd < firstSeq) ||
        (lastSeq !== undefined && parsedEnd > lastSeq)));
  const hasAppliedRange = Boolean(seqStart || seqEnd);
  const canApply = Boolean(
    selectedStream && !hasInvalidStart && !hasInvalidEnd && !isReversed && !isOutOfRange,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Sequence range</Label>
        {hasAppliedRange && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onClearSequenceFilter}
          >
            Clear
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={startValue}
          onChange={(event) => setStartValue(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="From"
          aria-label="Start sequence"
          aria-invalid={hasInvalidStart || isReversed || isOutOfRange}
        />
        <Input
          value={endValue}
          onChange={(event) => setEndValue(event.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="To"
          aria-label="End sequence"
          aria-invalid={hasInvalidEnd || isReversed || isOutOfRange}
        />
      </div>
      {(isReversed || isOutOfRange || hasInvalidStart || hasInvalidEnd) && (
        <p className="text-xs text-destructive">
          Enter a valid sequence range
          {firstSeq !== undefined || lastSeq !== undefined
            ? ` between ${firstSeq ?? 1} and ${lastSeq ?? 'the latest'}`
            : ''}
          .
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onSequenceRangeChange(parsedStart, parsedEnd)}
        disabled={!canApply}
      >
        Apply range
      </Button>
    </div>
  );
}

interface MessageListProps {
  selectedStream: string | null;
  streamNames: string[];
  consumers: ConsumerInfo[];
  messagesData: MessagesResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  messagesError: Error | null;
  maskSensitive: boolean;
  liveMode: boolean;
  latestMode: boolean;
  limit: number;
  seqStart: number | undefined;
  seqEnd: number | undefined;
  liveIntervalMs: number;
  bookmarks: number[];
  cursorHistory: Array<number | undefined>;
  compareSelection: number[];
  expandedPayloads: Record<number, boolean>;
  loadedPayloads: Record<number, unknown>;
  payloadLoading: Record<number, boolean>;
  showHeadersCol: boolean;
  showSizeCol: boolean;
  showTimeCol: boolean;
  filterSubject: string;
  headerKey: string;
  headerValue: string;
  payloadContains: string;
  datePreset: MessageDatePreset;
  dateRange: DateRange | undefined;
  datePresetLabels: Record<MessageDatePreset, string>;
  subjectOptions: string[];
  focusConsumer: string;
  focusWindow: 'pending' | 'ack_pending' | '';
  isPublishing: boolean;
  diffMessagesCount: number;
  listContainerRef: React.Ref<HTMLDivElement>;
  onLimitChange: (value: number) => void;
  onSelectStream: (streamName: string) => void;
  onLatestMessages: () => void;
  onLiveModeChange: (value: boolean) => void;
  onLiveIntervalChange: (value: number) => void;
  onRefetch: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onFirstPage: () => void;
  onGoToPage: (page: number) => void;
  onGoToSequence: (seq: number) => void;
  onToggleBookmark: (seq: number) => void;
  onToggleCompare: (seq: number) => void;
  onLoadPayload: (seq: number) => void;
  onHidePayload: (seq: number) => void;
  onReplayMessage: (message: MessageData) => void;
  onCopyCli: (message: MessageData) => void;
  onDeleteMessage?: (message: MessageData) => void;
  onShowDiffViewer: () => void;
  onFilterSubjectChange: (value: string) => void;
  onHeaderKeyChange: (value: string) => void;
  onHeaderValueChange: (value: string) => void;
  onPayloadContainsChange: (value: string) => void;
  onDatePresetChange: (value: MessageDatePreset) => void;
  onDateRangeChange: (value: DateRange | undefined) => void;
  onSequenceRangeChange: (start: number | undefined, end: number | undefined) => void;
  onClearFilter: (filter: MessageFilterKey) => void;
  onClearFilters: () => void;
  onShowHeadersColChange: (value: boolean) => void;
  onShowSizeColChange: (value: boolean) => void;
  onShowTimeColChange: (value: boolean) => void;
  className?: string;
}

export function MessageList({
  selectedStream,
  streamNames,
  consumers,
  messagesData,
  isLoading,
  isFetching,
  isError,
  messagesError,
  maskSensitive,
  liveMode,
  latestMode,
  limit,
  seqStart,
  seqEnd,
  liveIntervalMs,
  bookmarks,
  cursorHistory,
  compareSelection,
  expandedPayloads,
  loadedPayloads,
  payloadLoading,
  showHeadersCol,
  showSizeCol,
  showTimeCol,
  filterSubject,
  headerKey,
  headerValue,
  payloadContains,
  datePreset,
  dateRange,
  datePresetLabels,
  subjectOptions,
  focusConsumer,
  focusWindow,
  isPublishing,
  diffMessagesCount,
  listContainerRef,
  onLimitChange,
  onSelectStream,
  onLatestMessages,
  onLiveModeChange,
  onLiveIntervalChange,
  onRefetch,
  onNextPage,
  onPreviousPage,
  onGoToPage,
  onGoToSequence,
  onToggleBookmark,
  onToggleCompare,
  onLoadPayload,
  onHidePayload,
  onReplayMessage,
  onCopyCli,
  onDeleteMessage,
  onShowDiffViewer,
  onFilterSubjectChange,
  onHeaderKeyChange,
  onHeaderValueChange,
  onPayloadContainsChange,
  onDatePresetChange,
  onDateRangeChange,
  onSequenceRangeChange,
  onClearFilter,
  onClearFilters,
  onShowHeadersColChange,
  onShowSizeColChange,
  onShowTimeColChange,
  className,
}: MessageListProps) {
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [draftDateRange, setDraftDateRange] = useState<DateRange | undefined>(dateRange);
  const customDateOpenTimeoutRef = useRef<number | null>(null);
  const pendingCustomDateOpenRef = useRef(false);
  const currentMessages = useMemo(() => messagesData?.messages ?? [], [messagesData?.messages]);
  const subjectSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const subject of [
      ...subjectOptions,
      ...currentMessages.map((message) => message.subject),
    ]) {
      if (subject?.trim()) seen.add(subject.trim());
    }
    return Array.from(seen).slice(0, 12);
  }, [currentMessages, subjectOptions]);
  const focusLabel =
    focusConsumer && focusWindow
      ? `${focusConsumer} ${focusWindow === 'ack_pending' ? 'ack pending' : 'pending'} window`
      : '';
  const sequenceFilterLabel =
    seqStart && seqEnd
      ? `Sequence: ${seqStart}-${seqEnd}`
      : seqStart
        ? `Sequence >= ${seqStart}`
        : seqEnd
          ? `Sequence <= ${seqEnd}`
          : focusLabel
            ? `Sequence: ${focusLabel}`
            : '';
  const hasHeaderFilter = Boolean(headerKey || headerValue);
  const hasDateFilter = datePreset !== 'all' || Boolean(dateRange?.from || dateRange?.to);
  const hasSequenceFilter = Boolean(seqStart || seqEnd || focusConsumer || focusWindow);
  const advancedFilterCount = Number(hasHeaderFilter) + Number(hasSequenceFilter);
  const selectedDatePreset = customDateOpen ? 'custom' : datePreset;
  const dateFilterLabel =
    datePreset === 'custom' && dateRange?.from
      ? formatDateRangeLabel(dateRange)
      : (datePresetLabels[datePreset] ?? 'Date range');

  useEffect(() => {
    if (!customDateOpen) {
      setDraftDateRange(dateRange);
    }
  }, [customDateOpen, dateRange]);

  useEffect(
    () => () => {
      if (customDateOpenTimeoutRef.current) {
        window.clearTimeout(customDateOpenTimeoutRef.current);
      }
      pendingCustomDateOpenRef.current = false;
    },
    [],
  );

  const clearCustomDateOpenTimeout = () => {
    if (customDateOpenTimeoutRef.current) {
      window.clearTimeout(customDateOpenTimeoutRef.current);
      customDateOpenTimeoutRef.current = null;
    }
  };

  const openCustomDateRange = () => {
    clearCustomDateOpenTimeout();
    setDraftDateRange(dateRange);
    setCustomDateOpen(true);
  };

  const openCustomDateRangeAfterSelectCloses = () => {
    clearCustomDateOpenTimeout();
    pendingCustomDateOpenRef.current = false;
    customDateOpenTimeoutRef.current = window.setTimeout(() => {
      customDateOpenTimeoutRef.current = null;
      setDraftDateRange(dateRange);
      setCustomDateOpen(true);
    }, 50);
  };

  const handleCustomDateOpenChange = (open: boolean) => {
    if (!open) {
      clearCustomDateOpenTimeout();
    }
    setCustomDateOpen(open);
    if (open) {
      setDraftDateRange(dateRange);
    }
  };

  const handleDateSelectOpenChange = (open: boolean) => {
    if (!open && pendingCustomDateOpenRef.current) {
      openCustomDateRangeAfterSelectCloses();
    }
  };

  const handleCustomDateOptionInteract = () => {
    pendingCustomDateOpenRef.current = true;
  };

  const handleCustomDateOptionKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleCustomDateOptionInteract();
    }
  };

  const handleDatePresetSelect = (value: string) => {
    const preset = value as MessageDatePreset;

    if (preset === 'custom') {
      pendingCustomDateOpenRef.current = true;
      return;
    }

    clearCustomDateOpenTimeout();
    pendingCustomDateOpenRef.current = false;
    setCustomDateOpen(false);
    setDraftDateRange(undefined);
    onDatePresetChange(preset);
  };

  const handleCancelCustomDateRange = () => {
    setDraftDateRange(dateRange);
    setCustomDateOpen(false);
  };

  const handleApplyCustomDateRange = () => {
    if (!draftDateRange?.from) return;

    onDateRangeChange(draftDateRange);
    setCustomDateOpen(false);
  };

  const handleClearCustomDateRange = () => {
    onDateRangeChange(undefined);
    setDraftDateRange(undefined);
    setCustomDateOpen(false);
  };

  const activeFilters = useMemo(
    () =>
      [
        filterSubject ? { key: 'subject', label: `Subject: ${filterSubject}` } : null,
        payloadContains ? { key: 'payload', label: `Payload: ${payloadContains}` } : null,
        hasHeaderFilter
          ? {
              key: 'header',
              label:
                headerKey && headerValue
                  ? `Header: ${headerKey}=${headerValue}`
                  : headerKey
                    ? `Header key: ${headerKey}`
                    : `Header value: ${headerValue}`,
            }
          : null,
        hasDateFilter ? { key: 'date', label: `Date: ${dateFilterLabel}` } : null,
        hasSequenceFilter
          ? {
              key: 'sequence',
              label: sequenceFilterLabel,
            }
          : null,
      ].filter((filter): filter is { key: MessageFilterKey; label: string } => filter !== null),
    [
      dateFilterLabel,
      hasDateFilter,
      hasHeaderFilter,
      hasSequenceFilter,
      filterSubject,
      headerKey,
      headerValue,
      payloadContains,
      sequenceFilterLabel,
    ],
  );
  const scannedLabel =
    messagesData?.scanned !== undefined && messagesData.range_start !== undefined
      ? `Scanned ${messagesData.scanned} sequences from ${messagesData.range_start} to ${messagesData.range_end ?? messagesData.last_seq ?? 'latest'}`
      : '';

  const renderPayload = (message: MessageData): string => {
    const base =
      expandedPayloads[message.seq] &&
      Object.prototype.hasOwnProperty.call(loadedPayloads, message.seq)
        ? formatPayload(loadedPayloads[message.seq])
        : formatPayload(message.data_preview ?? '');
    return maskSensitive ? maskSensitiveText(base) : base;
  };

  const exportJson = () => {
    downloadFile('messages.json', JSON.stringify(currentMessages, null, 2), 'application/json');
  };

  const exportCsv = () => {
    downloadFile('messages.csv', toCsv(currentMessages), 'text/csv');
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="space-y-4 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="w-full sm:w-72">
              <Label className="sr-only">Stream</Label>
              <Select
                value={selectedStream ?? undefined}
                onValueChange={onSelectStream}
                disabled={streamNames.length === 0}
              >
                <SelectTrigger aria-label="Stream">
                  <SelectValue placeholder="Select stream" />
                </SelectTrigger>
                <SelectContent>
                  {streamNames.map((streamName) => (
                    <SelectItem key={streamName} value={streamName}>
                      {streamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">Messages</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {messagesData
                  ? `${currentMessages.length} shown of ${messagesData.total} stored messages`
                  : 'Filter and inspect stream messages'}
              </p>
              {scannedLabel && <p className="mt-1 text-xs text-muted-foreground">{scannedLabel}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onLatestMessages}
              disabled={!selectedStream}
              variant={latestMode ? 'default' : 'outline'}
              size="sm"
              aria-pressed={latestMode}
            >
              <ListRestart className="h-4 w-4" />
              Latest
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={!selectedStream}>
                  <Hash className="h-4 w-4" />
                  Jump
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <JumpToSequenceControl
                  selectedStream={selectedStream}
                  firstSeq={messagesData?.first_seq}
                  lastSeq={messagesData?.last_seq}
                  onGoToSequence={onGoToSequence}
                />
              </PopoverContent>
            </Popover>
            <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5">
              <span className="text-xs text-muted-foreground" aria-hidden>
                Live
              </span>
              <Slider
                value={[liveIntervalMs]}
                min={500}
                max={10000}
                step={500}
                onValueChange={([v]) => onLiveIntervalChange(v)}
                className="w-24"
                aria-label="Live tail interval"
              />
              <span className="w-8 text-right font-mono text-xs tabular-nums">
                {(liveIntervalMs / 1000).toFixed(liveIntervalMs % 1000 === 0 ? 0 : 1)}s
              </span>
            </div>
            <Button
              onClick={() => onLiveModeChange(!liveMode)}
              disabled={!selectedStream}
              variant={liveMode ? 'default' : 'outline'}
              size="sm"
            >
              {liveMode ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {liveMode ? 'Pause' : 'Live'}
            </Button>
            <Button onClick={onRefetch} disabled={!selectedStream} variant="outline" size="sm">
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  View
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-2">
                  <Label>Columns</Label>
                  <ToggleGroup
                    type="multiple"
                    size="sm"
                    variant="outline"
                    value={[
                      ...(showHeadersCol ? ['headers'] : []),
                      ...(showSizeCol ? ['size'] : []),
                      ...(showTimeCol ? ['time'] : []),
                    ]}
                    onValueChange={(values) => {
                      onShowHeadersColChange(values.includes('headers'));
                      onShowSizeColChange(values.includes('size'));
                      onShowTimeColChange(values.includes('time'));
                    }}
                    aria-label="Toggle columns"
                    className="flex-wrap justify-start"
                  >
                    <ToggleGroupItem value="headers" aria-label="Toggle headers column">
                      Headers
                    </ToggleGroupItem>
                    <ToggleGroupItem value="size" aria-label="Toggle size column">
                      Size
                    </ToggleGroupItem>
                    <ToggleGroupItem value="time" aria-label="Toggle time column">
                      Time
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={exportJson}
                >
                  JSON
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={exportCsv}
                >
                  CSV
                </Button>
              </PopoverContent>
            </Popover>
            <Button
              variant={diffMessagesCount === 2 ? 'default' : 'outline'}
              size="sm"
              onClick={onShowDiffViewer}
              disabled={diffMessagesCount !== 2}
            >
              Diff
            </Button>
          </div>
        </div>

        {focusLabel && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
            <Filter className="h-4 w-4 text-warning-foreground" />
            <span className="font-medium">{focusLabel}</span>
            <span className="text-muted-foreground">
              seq {seqStart ?? messagesData?.first_seq ?? 1} -{' '}
              {seqEnd ?? messagesData?.last_seq ?? 'end'}
            </span>
          </div>
        )}

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,1fr)_190px_auto]">
            <div className="relative">
              <GitBranch className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Subject pattern"
                placeholder="Subject pattern"
                value={filterSubject}
                onChange={(event) => onFilterSubjectChange(event.target.value)}
                className="pl-8"
              />
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Payload contains"
                placeholder="Payload contains"
                value={payloadContains}
                onChange={(event) => onPayloadContainsChange(event.target.value)}
                className="pl-8"
              />
            </div>
            <Popover open={customDateOpen} onOpenChange={handleCustomDateOpenChange}>
              <PopoverAnchor asChild>
                <div>
                  <Select
                    value={selectedDatePreset}
                    onValueChange={handleDatePresetSelect}
                    onOpenChange={handleDateSelectOpenChange}
                  >
                    <SelectTrigger aria-label="Date preset" className="gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(datePresetLabels).map(([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          onPointerDown={
                            value === 'custom' ? handleCustomDateOptionInteract : undefined
                          }
                          onKeyDown={value === 'custom' ? handleCustomDateOptionKeyDown : undefined}
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverAnchor>
              <PopoverContent
                className="w-auto max-w-[calc(100vw-2rem)] p-0"
                align="start"
                sideOffset={8}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onFocusOutside={(event) => event.preventDefault()}
              >
                <div className="border-b px-4 py-3">
                  <Label className="text-sm">Custom date range</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateRangeLabel(draftDateRange)}
                  </p>
                </div>
                <div className="relative">
                  <Calendar
                    mode="range"
                    defaultMonth={draftDateRange?.from ?? dateRange?.from}
                    selected={draftDateRange}
                    onSelect={setDraftDateRange}
                    numberOfMonths={2}
                    classNames={{
                      month_caption:
                        'relative flex h-8 w-full items-center justify-center px-10 pt-0',
                      caption_label: 'pointer-events-none text-sm font-medium',
                      nav: 'contents',
                      button_previous:
                        'absolute left-1 top-0 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background p-0 opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      button_next:
                        'absolute right-1 top-0 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background p-0 opacity-70 hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearCustomDateRange}
                    disabled={!dateRange?.from && !draftDateRange?.from}
                  >
                    Clear
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelCustomDateRange}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyCustomDateRange}
                      disabled={!draftDateRange?.from}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  {advancedFilterCount > 0 ? `Advanced · ${advancedFilterCount}` : 'Advanced'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)]" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Header match</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Header key"
                        value={headerKey}
                        onChange={(event) => onHeaderKeyChange(event.target.value)}
                      />
                      <Input
                        placeholder="Header value"
                        value={headerValue}
                        onChange={(event) => onHeaderValueChange(event.target.value)}
                      />
                    </div>
                  </div>
                  <SequenceRangeControl
                    selectedStream={selectedStream}
                    seqStart={seqStart}
                    seqEnd={seqEnd}
                    firstSeq={messagesData?.first_seq}
                    lastSeq={messagesData?.last_seq}
                    onSequenceRangeChange={onSequenceRangeChange}
                    onClearSequenceFilter={() => onClearFilter('sequence')}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {subjectSuggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                Subject suggestions
              </span>
              {subjectSuggestions.slice(0, 8).map((suggestedSubject) => {
                const isSelected = filterSubject === suggestedSubject;

                return (
                  <Button
                    key={suggestedSubject}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 max-w-[14rem] min-w-0 justify-start rounded-md px-2 text-xs"
                    onClick={() => onFilterSubjectChange(suggestedSubject)}
                    title={`Filter by ${suggestedSubject}`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                    <span className="min-w-0 truncate font-mono">{suggestedSubject}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter.key}
                  variant="outline"
                  className="max-w-full gap-1 rounded-md pr-1"
                >
                  {filter.key === 'date' && datePreset === 'custom' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto max-w-[16rem] justify-start truncate rounded-sm p-0 text-left text-xs font-semibold hover:bg-transparent hover:text-foreground"
                      onClick={openCustomDateRange}
                      aria-label={`Edit ${filter.label}`}
                    >
                      {filter.label}
                    </Button>
                  ) : (
                    <span className="max-w-[16rem] truncate">{filter.label}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 rounded-sm p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    onClick={() => onClearFilter(filter.key)}
                    aria-label={`Clear ${filter.label}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>

        {bookmarks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>Bookmarks:</span>
            {bookmarks.slice(0, 8).map((seq) => (
              <Button
                key={seq}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 font-mono text-xs"
                onClick={() => onGoToSequence(seq)}
              >
                {seq}
              </Button>
            ))}
          </div>
        )}
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
            {currentMessages.map((message: MessageData) => {
              const status = getMessageStatus(message, consumers);
              const StatusIcon = status.icon;

              return (
                <div
                  key={message.seq}
                  className={cn(
                    'space-y-2 border-l-4 border-l-transparent p-4',
                    compareSelection.includes(message.seq) && 'border-l-primary bg-primary/5',
                    bookmarks.includes(message.seq) &&
                      !compareSelection.includes(message.seq) &&
                      'border-l-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/10',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Checkbox
                        checked={compareSelection.includes(message.seq)}
                        onCheckedChange={() => onToggleCompare(message.seq)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onToggleBookmark(message.seq)}
                        title={
                          bookmarks.includes(message.seq) ? 'Remove bookmark' : 'Bookmark message'
                        }
                      >
                        <Star
                          className={cn(
                            'h-4 w-4',
                            bookmarks.includes(message.seq)
                              ? 'fill-yellow-400 text-yellow-500'
                              : 'text-muted-foreground',
                          )}
                        />
                      </Button>
                      <SubjectChip subject={message.subject} />
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-md border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300"
                      >
                        <Hash className="h-3 w-3" />
                        {message.seq}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn('gap-1 rounded-md', status.className)}
                        title={status.title}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      {compareSelection.includes(message.seq) && (
                        <Badge variant="outline" className="rounded-md">
                          selected
                        </Badge>
                      )}
                    </div>
                    {showTimeCol && (
                      <span className="text-xs text-muted-foreground">
                        {message.time ? new Date(message.time).toLocaleString() : '-'}
                      </span>
                    )}
                  </div>

                  <PayloadViewer payload={renderPayload(message)} maxHeight="300px" />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {showSizeCol && (
                        <Badge
                          variant="outline"
                          className="gap-1 rounded-md border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                        >
                          <FileText className="h-3 w-3" />
                          {message.payload_size ?? 0} bytes
                        </Badge>
                      )}
                      {showHeadersCol &&
                        message.headers &&
                        Object.keys(message.headers).length > 0 && (
                          <Badge
                            variant="outline"
                            className="gap-1 rounded-md border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                            title={Object.entries(message.headers)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ')}
                          >
                            <KeyRound className="h-3 w-3" />
                            {Object.keys(message.headers).length} header
                            {Object.keys(message.headers).length === 1 ? '' : 's'}
                          </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                      {expandedPayloads[message.seq] ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onHidePayload(message.seq)}
                        >
                          <EyeOff className="w-4 h-4" />
                          Hide
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onLoadPayload(message.seq)}
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
                        onClick={() => onReplayMessage(message)}
                        disabled={isPublishing}
                      >
                        <Play className="w-4 h-4" />
                        Replay
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onCopyCli(message)}>
                        <Copy className="w-4 h-4" />
                        CLI
                      </Button>
                      {onDeleteMessage && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDeleteMessage(message)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            {messagesData?.has_more
              ? 'No messages matched in this page. Continue to scan more sequences.'
              : 'No messages found for current filters.'}
          </div>
        )}
      </CardContent>
      {selectedStream && messagesData && (
        <Pagination
          pageIndex={cursorHistory.length}
          pageCount={messagesData.has_more ? cursorHistory.length + 2 : cursorHistory.length + 1}
          pageSize={limit}
          onPageChange={(newPageIndex) => {
            const currentPageIndex = cursorHistory.length;
            if (newPageIndex === currentPageIndex - 1) {
              onPreviousPage();
            } else if (newPageIndex === currentPageIndex + 1) {
              onNextPage();
            } else {
              onGoToPage(newPageIndex + 1);
            }
          }}
          onPageSizeChange={onLimitChange}
          totalItems={messagesData.total ?? currentMessages.length}
        />
      )}
    </Card>
  );
}
