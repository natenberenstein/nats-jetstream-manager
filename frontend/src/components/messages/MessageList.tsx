'use client';

import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Copy,
  Download,
  Eye,
  EyeOff,
  Filter,
  GitBranch,
  Pause,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';

import { MessageData, MessagesResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MessageDatePreset } from '@/components/messages/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SubjectChip, SubjectChips } from '@/components/subjects/SubjectChips';
import { downloadFile, formatPayload, maskSensitiveText, toCsv } from './utils';
import { PayloadViewer } from './PayloadViewer';

interface MessageListProps {
  selectedStream: string | null;
  messagesData: MessagesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  messagesError: Error | null;
  maskSensitive: boolean;
  liveMode: boolean;
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
  onShowDiffViewer: () => void;
  onFilterSubjectChange: (value: string) => void;
  onHeaderKeyChange: (value: string) => void;
  onHeaderValueChange: (value: string) => void;
  onPayloadContainsChange: (value: string) => void;
  onDatePresetChange: (value: MessageDatePreset) => void;
  onDateRangeChange: (value: DateRange | undefined) => void;
  onClearFilters: () => void;
  onShowHeadersColChange: (value: boolean) => void;
  onShowSizeColChange: (value: boolean) => void;
  onShowTimeColChange: (value: boolean) => void;
  className?: string;
}

export function MessageList({
  selectedStream,
  messagesData,
  isLoading,
  isError,
  messagesError,
  maskSensitive,
  liveMode,
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
  onShowDiffViewer,
  onFilterSubjectChange,
  onHeaderKeyChange,
  onHeaderValueChange,
  onPayloadContainsChange,
  onDatePresetChange,
  onDateRangeChange,
  onClearFilters,
  onShowHeadersColChange,
  onShowSizeColChange,
  onShowTimeColChange,
  className,
}: MessageListProps) {
  const [jumpSeq, setJumpSeq] = useState('');
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
  const sequenceFilterLabel =
    seqStart && seqEnd
      ? `Seq: ${seqStart}-${seqEnd}`
      : seqStart
        ? `Seq >= ${seqStart}`
        : seqEnd
          ? `Seq <= ${seqEnd}`
          : '';
  const activeFilters = useMemo(
    () =>
      [
        filterSubject ? { key: 'subject', label: `Subject: ${filterSubject}` } : null,
        payloadContains ? { key: 'payload', label: `Payload: ${payloadContains}` } : null,
        headerKey
          ? { key: 'header', label: `Header: ${headerKey}${headerValue ? `=${headerValue}` : ''}` }
          : null,
        datePreset !== 'all'
          ? { key: 'date', label: datePresetLabels[datePreset] ?? 'Date range' }
          : null,
        seqStart || seqEnd
          ? {
              key: 'sequence',
              label: sequenceFilterLabel,
            }
          : null,
      ].filter((filter): filter is { key: string; label: string } => filter !== null),
    [
      datePreset,
      datePresetLabels,
      filterSubject,
      headerKey,
      headerValue,
      payloadContains,
      sequenceFilterLabel,
      seqEnd,
      seqStart,
    ],
  );
  const focusLabel =
    focusConsumer && focusWindow
      ? `${focusConsumer} ${focusWindow === 'ack_pending' ? 'ack pending' : 'pending'} window`
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
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">
              Messages {selectedStream ? `(${selectedStream})` : ''}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {messagesData
                ? `${currentMessages.length} shown of ${messagesData.total} stored messages`
                : 'Filter and inspect stream messages'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
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
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Payload contains"
                value={payloadContains}
                onChange={(event) => onPayloadContainsChange(event.target.value)}
                className="pl-8"
              />
            </label>
            <label className="relative">
              <GitBranch className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Subject pattern"
                value={filterSubject}
                onChange={(event) => onFilterSubjectChange(event.target.value)}
                className="pl-8"
              />
            </label>
            <Select
              value={datePreset}
              onValueChange={(value) => onDatePresetChange(value as MessageDatePreset)}
            >
              <SelectTrigger aria-label="Date preset" className="gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(datePresetLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  More Filters
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
                  <div className="space-y-2">
                    <Label>Jump to sequence</Label>
                    <div className="flex gap-2">
                      <Input
                        value={jumpSeq}
                        onChange={(event) => setJumpSeq(event.target.value)}
                        inputMode="numeric"
                        placeholder="Sequence"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const seq = Number(jumpSeq);
                          if (Number.isInteger(seq) && seq > 0) onGoToSequence(seq);
                        }}
                        disabled={!selectedStream}
                      >
                        Go
                      </Button>
                    </div>
                  </div>
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
                      className="justify-start"
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
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {datePreset === 'custom' && (
            <DateRangePicker
              value={dateRange}
              onChange={onDateRangeChange}
              className="mt-2 max-w-md"
            />
          )}

          {subjectSuggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Subjects</span>
              <SubjectChips subjects={subjectSuggestions} maxVisible={6} />
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <Badge key={filter.key} variant="outline" className="gap-1 rounded-md pr-1">
                  {filter.label}
                  <button type="button" onClick={onClearFilters} aria-label="Clear filters">
                    <X className="h-3 w-3" />
                  </button>
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
            {currentMessages.map((message: MessageData) => (
              <div key={message.seq} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
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
                    <span className="text-xs text-muted-foreground">seq {message.seq}</span>
                  </div>
                  {showTimeCol && (
                    <span className="text-xs text-muted-foreground">
                      {message.time ? new Date(message.time).toLocaleString() : '-'}
                    </span>
                  )}
                </div>

                <PayloadViewer payload={renderPayload(message)} maxHeight="300px" />

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
      {selectedStream && currentMessages.length > 0 && messagesData && (
        <Pagination
          pageIndex={cursorHistory.length}
          pageCount={
            messagesData.total ? Math.ceil(messagesData.total / limit) : cursorHistory.length + 1
          }
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
