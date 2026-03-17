'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Maximize2, Minimize2, WrapText } from 'lucide-react';

import { MessageData } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { DiffRow, DiffSummary, DiffWorkerRequest, DiffWorkerResponse } from './types';
import { collapseEqualRows, diffCellClass, formatPayload, maskSensitiveText } from './utils';

interface DiffViewerProps {
  diffMessages: MessageData[];
  loadedPayloads: Record<number, unknown>;
  compareLoading: Record<number, boolean>;
  maskSensitive: boolean;
  showDiffViewer: boolean;
  onClose: () => void;
  onOpen: () => void;
  onError: (message: string) => void;
}

export function DiffCompareCard({
  diffMessages,
  compareLoading,
  onOpen,
}: {
  diffMessages: MessageData[];
  compareLoading: Record<number, boolean>;
  onOpen: () => void;
}) {
  if (diffMessages.length !== 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Diff Compare</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Selected seq {diffMessages[0].seq} and seq {diffMessages[1].seq}
        </div>
        {(compareLoading[diffMessages[0].seq] || compareLoading[diffMessages[1].seq]) && (
          <div className="text-xs text-muted-foreground">Loading full payloads for diff…</div>
        )}
        <Button size="sm" onClick={onOpen}>
          Open Diff Viewer
        </Button>
      </CardContent>
    </Card>
  );
}

export function DiffViewerModal({
  diffMessages,
  loadedPayloads,
  compareLoading,
  maskSensitive,
  showDiffViewer,
  onClose,
  onError,
}: DiffViewerProps) {
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
  const [diffScrollTop, setDiffScrollTop] = useState(0);
  const [diffViewportHeight, setDiffViewportHeight] = useState(320);
  const diffWorkerRef = useRef<Worker | null>(null);
  const diffJobIdRef = useRef(0);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  const canShow = showDiffViewer && diffMessages.length === 2;

  useEffect(() => {
    if (!canShow) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [canShow]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const worker = new Worker(new URL('../../workers/diff.worker.ts', import.meta.url));
    diffWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
      const payload = event.data;
      if (payload.id !== diffJobIdRef.current) return;
      setDiffRows(payload.rows);
      setDiffSummary(payload.summary);
      if (payload.error) {
        onError(payload.error);
      }
      setDiffBusy(false);
    };

    worker.onerror = () => {
      setDiffBusy(false);
      onError('Diff worker failed');
    };

    return () => {
      worker.terminate();
      diffWorkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!canShow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-7xl rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Diff Viewer</h2>
            <p className="text-xs text-muted-foreground">
              Comparing seq {diffMessages[0].seq} vs seq {diffMessages[1].seq}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
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
              {diffExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
            <span className="rounded bg-emerald-100/70 px-2 py-1">Added: {diffSummary.added}</span>
            <span className="rounded bg-rose-100/70 px-2 py-1">Removed: {diffSummary.removed}</span>
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
  );
}
