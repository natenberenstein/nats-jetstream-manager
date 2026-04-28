'use client';

import {
  ReactNode,
  useEffect,
  useMemo,
  useState,
  createContext,
  useContext,
  useRef,
  useCallback,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ConfirmTone = 'default' | 'destructive';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** If set, require the user to type this string (e.g. "DELETE") to confirm. */
  requireTypedConfirmation?: string;
}

type Resolver = (value: boolean) => void;

export interface PromptOptions {
  title: string;
  description?: ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolverRef = useRef<Resolver | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const [promptOptions, setPromptOptions] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);

  const confirm = useCallback<ConfirmContextValue['confirm']>((opts) => {
    setOptions(opts);
    setTyped('');
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const prompt = useCallback<ConfirmContextValue['prompt']>((opts) => {
    setPromptOptions(opts);
    setPromptValue(opts.defaultValue ?? '');
    setPromptError(null);
    return new Promise<string | null>((resolve) => {
      promptResolverRef.current = resolve;
    });
  }, []);

  const closePrompt = (result: string | null) => {
    promptResolverRef.current?.(result);
    promptResolverRef.current = null;
    setPromptOptions(null);
    setPromptValue('');
    setPromptError(null);
  };

  const submitPrompt = () => {
    if (!promptOptions) return;
    const trimmed = promptValue.trim();
    if (!trimmed) {
      setPromptError('Value is required');
      return;
    }
    const err = promptOptions.validate?.(trimmed) ?? null;
    if (err) {
      setPromptError(err);
      return;
    }
    closePrompt(trimmed);
  };

  const close = (result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    setTyped('');
  };

  useEffect(() => {
    if (options && !options.requireTypedConfirmation) {
      const t = setTimeout(() => confirmButtonRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [options]);

  const tone: ConfirmTone = options?.tone ?? 'default';
  const needsTyped = !!options?.requireTypedConfirmation;
  const typedOk = !needsTyped || typed === options?.requireTypedConfirmation;

  const handleConfirm = () => {
    if (!typedOk) return;
    close(true);
  };

  const contextValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <Dialog open={!!options} onOpenChange={(o) => !o && close(false)}>
        {options && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                <span className="flex items-center gap-2">
                  {tone === 'destructive' && (
                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
                  )}
                  {options.title}
                </span>
              </DialogTitle>
              {options.description && <DialogDescription>{options.description}</DialogDescription>}
            </DialogHeader>
            <div className="space-y-3">
              {options.body}
              {needsTyped && (
                <div className="space-y-1">
                  <Label htmlFor="confirm-typed">
                    Type{' '}
                    <span className="font-mono font-semibold">
                      {options.requireTypedConfirmation}
                    </span>{' '}
                    to confirm
                  </Label>
                  <Input
                    id="confirm-typed"
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && typedOk) void handleConfirm();
                    }}
                    placeholder={options.requireTypedConfirmation}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                ref={confirmButtonRef}
                type="button"
                variant={tone === 'destructive' ? 'destructive' : 'default'}
                onClick={handleConfirm}
                disabled={!typedOk}
              >
                {options.confirmLabel ?? (tone === 'destructive' ? 'Delete' : 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!promptOptions} onOpenChange={(o) => !o && closePrompt(null)}>
        {promptOptions && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{promptOptions.title}</DialogTitle>
              {promptOptions.description && (
                <DialogDescription>{promptOptions.description}</DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-1">
              {promptOptions.label && <Label htmlFor="prompt-value">{promptOptions.label}</Label>}
              <Input
                id="prompt-value"
                autoFocus
                value={promptValue}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  if (promptError) setPromptError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitPrompt();
                  }
                }}
                placeholder={promptOptions.placeholder}
              />
              {promptError && <p className="text-sm text-destructive">{promptError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closePrompt(null)}>
                {promptOptions.cancelLabel ?? 'Cancel'}
              </Button>
              <Button type="button" onClick={submitPrompt}>
                {promptOptions.confirmLabel ?? 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}

export function usePrompt() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('usePrompt must be used inside <ConfirmProvider>');
  return ctx.prompt;
}
