'use client';

import React, { useMemo, useState } from 'react';
import { Copy, Check, WrapText, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PayloadViewerProps {
  payload: string;
  maxHeight?: string;
}

function highlightJson(json: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match JSON tokens: strings, numbers, booleans, null, punctuation
  const tokenRegex =
    /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false)\b|(null)\b|([{}[\]:,])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(json)) !== null) {
    // Add any whitespace between tokens
    if (match.index > lastIndex) {
      nodes.push(json.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Key
      nodes.push(
        <span key={key++} className="text-sky-600 dark:text-sky-400">
          {match[1]}
        </span>,
      );
      // The colon after the key
      const colonIdx = json.indexOf(':', match.index + match[1].length);
      if (colonIdx >= 0) {
        nodes.push(json.slice(match.index + match[1].length, colonIdx));
        nodes.push(':');
        lastIndex = colonIdx + 1;
        continue;
      }
    } else if (match[2]) {
      // String value
      nodes.push(
        <span key={key++} className="text-emerald-600 dark:text-emerald-400">
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // Number
      nodes.push(
        <span key={key++} className="text-amber-600 dark:text-amber-400">
          {match[3]}
        </span>,
      );
    } else if (match[4]) {
      // Boolean
      nodes.push(
        <span key={key++} className="text-violet-600 dark:text-violet-400">
          {match[4]}
        </span>,
      );
    } else if (match[5]) {
      // null
      nodes.push(
        <span key={key++} className="text-rose-500 dark:text-rose-400">
          {match[5]}
        </span>,
      );
    } else if (match[6]) {
      // Punctuation
      nodes.push(
        <span key={key++} className="text-muted-foreground">
          {match[6]}
        </span>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex));
  }

  return nodes;
}

function tryFormatJson(raw: string): { formatted: string; isJson: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { formatted: raw, isJson: false };
  try {
    const parsed = JSON.parse(trimmed);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
  } catch {
    return { formatted: raw, isJson: false };
  }
}

export function PayloadViewer({ payload, maxHeight = '400px' }: PayloadViewerProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const { formatted, isJson } = useMemo(() => tryFormatJson(payload), [payload]);
  const highlighted = useMemo(
    () => (isJson && !showRaw ? highlightJson(formatted) : null),
    [isJson, showRaw, formatted],
  );

  const displayText = showRaw ? payload : formatted;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group">
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {isJson && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowRaw(!showRaw)}
            title={showRaw ? 'Format' : 'Raw'}
          >
            {showRaw ? <Code className="w-3 h-3" /> : <WrapText className="w-3 h-3" />}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} title="Copy">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      <pre
        className="text-xs bg-muted/40 border rounded p-3 overflow-auto whitespace-pre-wrap break-all"
        style={{ maxHeight }}
      >
        {highlighted ?? displayText}
      </pre>
    </div>
  );
}
