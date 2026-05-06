'use client';

import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, AlertTriangle, FileClock, Search } from 'lucide-react';

import { useAuditEntries } from '@/hooks/useAudit';
import { AuditLogEntry } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { LastUpdated } from '@/components/ui/last-updated';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

function auditTone(
  action: string,
): 'default' | 'secondary' | 'destructive' | 'warning' | 'outline' {
  const normalized = action.toLowerCase();
  if (/(delete|destroy|purge|cancel|failed)/.test(normalized)) return 'destructive';
  if (/(update|replay|publish)/.test(normalized)) return 'warning';
  if (/(create|connect|success|completed)/.test(normalized)) return 'default';
  return 'outline';
}

function detailsPreview(entry: AuditLogEntry): string {
  if (!entry.details || Object.keys(entry.details).length === 0) return '-';
  return JSON.stringify(entry.details);
}

function SortableHeader({
  column,
  children,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | 'asc' | 'desc' };
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {children}
      <ArrowUpDown className="ml-1.5 h-3 w-3 opacity-60" />
    </Button>
  );
}

const columns: ColumnDef<AuditLogEntry>[] = [
  {
    accessorKey: 'created_at',
    id: 'time',
    header: ({ column }) => <SortableHeader column={column}>Time</SortableHeader>,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {new Date(row.original.created_at).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'action',
    id: 'action',
    header: 'Action',
    cell: ({ row }) => (
      <Badge variant={auditTone(row.original.action)} className="rounded-md">
        {row.original.action}
      </Badge>
    ),
    filterFn: (row, _id, value) =>
      String(row.original.action).toLowerCase().includes(String(value).toLowerCase()),
  },
  {
    accessorKey: 'resource_type',
    id: 'resource',
    header: 'Resource',
    cell: ({ row }) => <span className="font-medium">{row.original.resource_type}</span>,
  },
  {
    accessorKey: 'resource_name',
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="block max-w-[220px] truncate font-mono text-xs">
        {row.original.resource_name || '-'}
      </span>
    ),
  },
  {
    id: 'user',
    header: 'User',
    cell: ({ row }) => (
      <span className="block max-w-[220px] truncate">
        {row.original.user_email || row.original.user_id || '-'}
      </span>
    ),
  },
  {
    accessorKey: 'connection_id',
    id: 'connection',
    header: 'Connection',
    cell: ({ row }) => (
      <span className="block max-w-[180px] truncate font-mono text-xs text-muted-foreground">
        {row.original.connection_id || '-'}
      </span>
    ),
  },
  {
    id: 'details',
    header: 'Details',
    cell: ({ row }) => {
      const preview = detailsPreview(row.original);
      if (preview === '-') return <span className="text-muted-foreground">-</span>;
      return (
        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>
            <span className="block max-w-[320px] cursor-help truncate font-mono text-xs text-muted-foreground hover:text-foreground">
              {preview}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-96" align="end">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Details</p>
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
              {JSON.stringify(row.original.details, null, 2)}
            </pre>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
];

export default function AuditPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [userId, setUserId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const query = useMemo(() => {
    const trimmedUserId = userId.trim();
    const parsedUserId = Number(trimmedUserId);
    return {
      limit: pageSize,
      offset: pageIndex * pageSize,
      action: action.trim() || undefined,
      resourceType: resourceType.trim() || undefined,
      userId: trimmedUserId && Number.isInteger(parsedUserId) ? parsedUserId : undefined,
    };
  }, [action, pageIndex, pageSize, resourceType, userId]);

  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } =
    useAuditEntries(query);

  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];
    if (!dateRange?.from) return data.entries;
    const fromMs = dateRange.from.getTime();
    const toMs = dateRange.to ? dateRange.to.getTime() + 24 * 60 * 60 * 1000 - 1 : Date.now();
    return data.entries.filter((entry) => {
      const ts = new Date(entry.created_at).getTime();
      return ts >= fromMs && ts <= toMs;
    });
  }, [data?.entries, dateRange]);

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const resetFilters = () => {
    setAction('');
    setResourceType('');
    setUserId('');
    setDateRange(undefined);
    setPageIndex(0);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Audit Log"
        description="Review operational changes and high-risk actions"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching}
            onRefresh={() => refetch()}
          />
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_160px_minmax(220px,1fr)_auto]">
          <Input
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPageIndex(0);
            }}
            placeholder="Action, e.g. stream.delete"
          />
          <Input
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPageIndex(0);
            }}
            placeholder="Resource, e.g. stream"
          />
          <Input
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setPageIndex(0);
            }}
            inputMode="numeric"
            placeholder="User ID"
          />
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            placeholder="Date range (visible page)"
          />
          <Button type="button" variant="outline" onClick={resetFilters}>
            Clear
          </Button>
        </CardContent>
      </Card>

      {isError && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Failed to load audit log: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <CardContent className="p-0">
            <TableSkeleton rows={8} columns={7} />
          </CardContent>
        ) : filteredEntries.length ? (
          <CardContent className="p-4">
            <DataTable
              columns={columns}
              data={filteredEntries}
              pageSize={pageSize}
              hideFooter
              emptyText="No audit entries match your filters."
            />
            <div className="mt-3 border-t pt-3">
              <Pagination
                pageIndex={pageIndex}
                pageCount={pageCount}
                pageSize={pageSize}
                onPageChange={setPageIndex}
                onPageSizeChange={setPageSize}
                totalItems={data?.total ?? 0}
              />
            </div>
          </CardContent>
        ) : (
          <CardContent className="p-8 text-center">
            <FileClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No audit entries found.</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
