'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, FileClock, Search } from 'lucide-react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function auditTone(
  action: string,
): 'default' | 'secondary' | 'destructive' | 'warning' | 'outline' {
  const normalized = action.toLowerCase();
  if (/(delete|destroy|purge|cancel|failed)/.test(normalized)) return 'destructive';
  if (/(update|replay|publish)/.test(normalized)) return 'warning';
  if (/(create|connect|success|completed)/.test(normalized)) return 'default';
  return 'outline';
}

function formatDetails(entry: AuditLogEntry): string {
  if (!entry.details || Object.keys(entry.details).length === 0) return '-';
  return JSON.stringify(entry.details);
}

export default function AuditPage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [userId, setUserId] = useState('');

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

  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const resetFilters = () => {
    setAction('');
    setResourceType('');
    setUserId('');
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
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_160px_auto]">
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
        ) : data?.entries.length ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={auditTone(entry.action)} className="rounded-md">
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{entry.resource_type}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs">
                      {entry.resource_name || '-'}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {entry.user_email || entry.user_id || '-'}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                      {entry.connection_id || '-'}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                      {formatDetails(entry)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              pageIndex={pageIndex}
              pageCount={pageCount}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={setPageSize}
              totalItems={data.total}
            />
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
