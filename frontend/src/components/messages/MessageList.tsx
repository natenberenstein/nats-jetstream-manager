'use client';

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, Play, RefreshCw } from 'lucide-react';

import { MessageData, MessagesResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { downloadFile, formatPayload, maskSensitiveText, toCsv } from './utils';

interface MessageListProps {
  selectedStream: string | null;
  messagesData: MessagesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  messagesError: Error | null;
  maskSensitive: boolean;
  limit: number;
  liveIntervalMs: number;
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
  isPublishing: boolean;
  diffMessagesCount: number;
  listContainerRef: React.Ref<HTMLDivElement>;
  onLimitChange: (value: number) => void;
  onLiveIntervalChange: (value: number) => void;
  onRefetch: () => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onFirstPage: () => void;
  onGoToPage: (page: number) => void;
  onToggleCompare: (seq: number) => void;
  onLoadPayload: (seq: number) => void;
  onHidePayload: (seq: number) => void;
  onReplayMessage: (message: MessageData) => void;
  onShowDiffViewer: () => void;
  onFilterSubjectChange: (value: string) => void;
  onHeaderKeyChange: (value: string) => void;
  onHeaderValueChange: (value: string) => void;
  onPayloadContainsChange: (value: string) => void;
  onShowHeadersColChange: (value: boolean) => void;
  onShowSizeColChange: (value: boolean) => void;
  onShowTimeColChange: (value: boolean) => void;
}

export function MessageList({
  selectedStream,
  messagesData,
  isLoading,
  isError,
  messagesError,
  maskSensitive,
  limit,
  liveIntervalMs,
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
  isPublishing,
  diffMessagesCount,
  listContainerRef,
  onLimitChange,
  onLiveIntervalChange,
  onRefetch,
  onNextPage,
  onPreviousPage,
  onGoToPage,
  onToggleCompare,
  onLoadPayload,
  onHidePayload,
  onReplayMessage,
  onShowDiffViewer,
  onFilterSubjectChange,
  onHeaderKeyChange,
  onHeaderValueChange,
  onPayloadContainsChange,
  onShowHeadersColChange,
  onShowSizeColChange,
  onShowTimeColChange,
}: MessageListProps) {
  const currentMessages = useMemo(() => messagesData?.messages ?? [], [messagesData?.messages]);

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
    <Card className="xl:col-span-3 overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">
            Recent Messages {selectedStream ? `(${selectedStream})` : ''}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(limit)}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              className="w-20"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
            <Select
              value={String(liveIntervalMs)}
              onChange={(e) => onLiveIntervalChange(Number(e.target.value))}
              className="w-24"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </Select>
            <Button onClick={onRefetch} disabled={!selectedStream} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4" />
              Refresh
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
              variant={diffMessagesCount === 2 ? 'default' : 'outline'}
              size="sm"
              onClick={onShowDiffViewer}
              disabled={diffMessagesCount !== 2}
            >
              Diff View
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
          <Input
            placeholder="Filter subject (e.g. orders.*)"
            value={filterSubject}
            onChange={(e) => onFilterSubjectChange(e.target.value)}
          />
          <Input
            placeholder="Header key"
            value={headerKey}
            onChange={(e) => onHeaderKeyChange(e.target.value)}
          />
          <Input
            placeholder="Header value"
            value={headerValue}
            onChange={(e) => onHeaderValueChange(e.target.value)}
          />
          <Input
            placeholder="Payload contains"
            value={payloadContains}
            onChange={(e) => onPayloadContainsChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showHeadersCol}
              onChange={(e) => onShowHeadersColChange(e.target.checked)}
            />
            Headers
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showSizeCol}
              onChange={(e) => onShowSizeColChange(e.target.checked)}
            />
            Size
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showTimeCol}
              onChange={(e) => onShowTimeColChange(e.target.checked)}
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
                      onChange={() => onToggleCompare(message.seq)}
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
      {selectedStream &&
        currentMessages.length > 0 &&
        (() => {
          const currentPage = cursorHistory.length + 1;
          const totalPages = messagesData?.total
            ? Math.ceil(messagesData.total / limit)
            : currentPage;
          const hasNext = !!(messagesData?.has_more && messagesData?.next_seq);

          // Build the set of page numbers to display (with ellipses)
          const pageNumbers: (number | 'ellipsis')[] = [];
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
          } else {
            pageNumbers.push(1);
            if (currentPage > 3) pageNumbers.push('ellipsis');
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);
            for (let i = start; i <= end; i++) pageNumbers.push(i);
            if (currentPage < totalPages - 2) pageNumbers.push('ellipsis');
            pageNumbers.push(totalPages);
          }

          return (
            <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/30">
              <span className="text-sm text-muted-foreground">
                {messagesData?.total != null && <>{messagesData.total.toLocaleString()} messages</>}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  onClick={onPreviousPage}
                  disabled={cursorHistory.length === 0}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {pageNumbers.map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-sm text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      onClick={() => page !== currentPage && onGoToPage(page)}
                      variant={page === currentPage ? 'default' : 'outline'}
                      size="icon"
                      className="h-8 w-8"
                    >
                      {page}
                    </Button>
                  ),
                )}
                <Button
                  onClick={onNextPage}
                  disabled={!hasNext}
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })()}
    </Card>
  );
}
