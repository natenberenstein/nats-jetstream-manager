'use client';

import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function SubjectText({ subject }: { subject: string }) {
  const parts = subject.split('.');

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center font-mono text-[11px] leading-4">
      {parts.map((part, index) => {
        const wildcard = part === '*' || part === '>';
        return (
          <span key={`${part}-${index}`} className="inline-flex items-center">
            {index > 0 && <span className="text-muted-foreground">.</span>}
            <span
              className={cn(
                'rounded-[2px]',
                wildcard ? 'font-semibold text-primary' : 'text-foreground',
              )}
            >
              {part || '*'}
            </span>
          </span>
        );
      })}
    </span>
  );
}

interface SubjectChipProps {
  subject?: string | null;
  fallback?: string;
  title?: string;
  className?: string;
}

export function SubjectChip({ subject, fallback = '*', title, className }: SubjectChipProps) {
  const value = subject?.trim() || fallback;
  const content = <SubjectText subject={value} />;
  const chipClassName = cn(
    'max-w-full cursor-default rounded-md border-border bg-background px-1.5 py-0.5 font-normal',
    className,
  );

  return (
    <Badge variant="outline" title={title ?? value} className={chipClassName}>
      {content}
    </Badge>
  );
}

interface SubjectChipsProps {
  subjects: Array<string | null | undefined>;
  maxVisible?: number;
  fallback?: string;
  className?: string;
}

export function SubjectChips({
  subjects,
  maxVisible = 2,
  fallback = '*',
  className,
}: SubjectChipsProps) {
  const values = subjects
    .map((subject) => subject?.trim())
    .filter((subject): subject is string => Boolean(subject));
  const normalized = values.length ? values : [fallback];
  const visible = normalized.slice(0, maxVisible);
  const hidden = normalized.slice(maxVisible);

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      {visible.map((subject) => (
        <SubjectChip key={subject} subject={subject} />
      ))}
      {hidden.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-md px-2 text-xs">
              +{hidden.length}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 max-w-[calc(100vw-2rem)]" align="start">
            <div className="flex flex-wrap gap-1.5">
              {hidden.map((subject) => (
                <SubjectChip key={subject} subject={subject} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
