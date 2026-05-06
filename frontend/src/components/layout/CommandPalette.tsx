'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

export interface CommandItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Bucket label used to group items. Items without a group land in "Navigation". */
  group?: string;
  /** Extra terms used for fuzzy matching but not shown in the label. */
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
}

export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  const router = useRouter();

  const groups = useMemo(() => {
    const buckets = new Map<string, CommandItem[]>();
    for (const item of items) {
      const key = item.group ?? 'Navigation';
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries());
  }, [items]);

  const select = (item: CommandItem) => {
    router.push(item.href);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search and navigate. Use arrow keys to move, Enter to open."
    >
      <CommandInput placeholder="Type a command (e.g. streams, messages)…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map(([group, groupItems], index) => (
          <div key={group}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {groupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.label} ${(item.keywords ?? []).join(' ')} ${item.href}`}
                    onSelect={() => select(item)}
                  >
                    <Icon className="text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
