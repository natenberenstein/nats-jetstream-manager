'use client';

import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type FieldLabelProps = {
  children: ReactNode;
  help: ReactNode;
  htmlFor?: string;
  className?: string;
  containerClassName?: string;
  helpLabel?: string;
};

function labelToText(label: ReactNode) {
  return typeof label === 'string' ? label : 'field';
}

export function FieldLabel({
  children,
  help,
  htmlFor,
  className,
  containerClassName,
  helpLabel,
}: FieldLabelProps) {
  return (
    <div className={cn('flex items-center gap-1.5', containerClassName)}>
      <Label htmlFor={htmlFor} className={className}>
        {children}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`About ${helpLabel ?? labelToText(children)}`}
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-80 whitespace-pre-line text-left leading-relaxed">
          {help}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
