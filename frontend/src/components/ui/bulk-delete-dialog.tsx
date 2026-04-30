'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type ItemStatus = 'pending' | 'running' | 'success' | 'error';

interface ItemState {
  name: string;
  status: ItemStatus;
  error?: string;
}

export interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  items: string[];
  /** Called for each item. Should throw on failure. */
  onDeleteItem: (name: string) => Promise<void>;
  /** Called once the run has finished (even if some items failed). */
  onFinished?: (summary: { succeeded: number; failed: string[] }) => void;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  onDeleteItem,
  onFinished,
}: BulkDeleteDialogProps) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [states, setStates] = useState<ItemState[]>([]);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (open) {
      setRunning(false);
      setFinished(false);
      setStates(itemsRef.current.map((name) => ({ name, status: 'pending' })));
      const t = setTimeout(() => confirmButtonRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const summary = useMemo(() => {
    const succeeded = states.filter((s) => s.status === 'success').length;
    const failed = states.filter((s) => s.status === 'error');
    return { succeeded, failed };
  }, [states]);

  const run = async () => {
    setRunning(true);
    let succeeded = 0;
    const failed: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const name = items[i];
      setStates((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)));
      try {
        await onDeleteItem(name);
        succeeded++;
        setStates((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'success' } : s)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        failed.push(name);
        setStates((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: 'error', error: msg } : s)),
        );
      }
    }
    setRunning(false);
    setFinished(true);
    onFinished?.({ succeeded, failed });
  };

  const handleClose = () => {
    if (running) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
              {title}
            </span>
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {finished
              ? `Finished: ${summary.succeeded} succeeded, ${summary.failed.length} failed.`
              : `This will permanently delete ${items.length} item${items.length === 1 ? '' : 's'}.`}
          </p>
          <div className="max-h-64 overflow-auto rounded border bg-muted/40 divide-y">
            {states.map((s) => (
              <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <StatusIcon status={s.status} />
                <span className="truncate font-mono">{s.name}</span>
                {s.error && (
                  <span className="ml-auto text-destructive truncate" title={s.error}>
                    {s.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          {finished ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={running}>
                Cancel
              </Button>
              <Button ref={confirmButtonRef} variant="destructive" onClick={run} disabled={running}>
                {running && <Spinner className="mr-1" />}
                Delete {items.length}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'pending')
    return <span className={cn('h-3.5 w-3.5 rounded-full border border-muted-foreground/40')} />;
  if (status === 'running') return <Spinner className="h-3.5 w-3.5 text-primary" label="Running" />;
  if (status === 'success')
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Success" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" aria-label="Failed" />;
}
