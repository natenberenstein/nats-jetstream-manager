import { MessageData } from '@/lib/types';
import { DiffCellType, DiffDisplayRow, DiffRow } from './types';

export function parseHeaders(input: string): Record<string, string> | undefined {
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

export function parsePayload(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

export function formatPayload(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function maskSensitiveText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(token|api[_-]?key|password)\b\s*[:=]\s*["']?[^"',\s]+/gi, '$1:[masked]');
}

export function toCsv(messages: MessageData[]): string {
  const header = ['seq', 'subject', 'payload_size', 'time'];
  const rows = messages.map((m) => [
    String(m.seq),
    JSON.stringify(m.subject ?? ''),
    String(m.payload_size ?? 0),
    JSON.stringify(m.time ?? ''),
  ]);
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function diffCellClass(type: DiffCellType): string {
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

export function collapseEqualRows(rows: DiffRow[], context = 2): DiffDisplayRow[] {
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
