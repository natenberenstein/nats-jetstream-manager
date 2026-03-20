'use client';

import { useState } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';

const ACTIONS = [
  '',
  'create_stream',
  'update_stream',
  'delete_stream',
  'purge_stream',
  'create_consumer',
  'delete_consumer',
  'publish_message',
  'publish_batch',
  'replay_message',
  'connect',
  'disconnect',
];

const RESOURCE_TYPES = ['', 'stream', 'consumer', 'message', 'connection'];

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading } = useAuditLog({
    limit: pageSize,
    offset: pageIndex * pageSize,
    action: action || undefined,
    resource_type: resourceType || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <p className="text-muted-foreground">Track all user actions and changes</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Action</label>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPageIndex(0);
            }}
            className="w-48"
          >
            <option value="">All Actions</option>
            {ACTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Resource Type</label>
          <Select
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPageIndex(0);
            }}
            className="w-48"
          >
            <option value="">All Types</option>
            {RESOURCE_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading audit log...</p>
        ) : data && data.entries.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            No audit log entries found.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left">
                  <th className="p-3">Time</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Resource Type</th>
                  <th className="p-3">Resource Name</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {entry.user_email || <span className="text-muted-foreground">system</span>}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs font-mono">
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">
                        {entry.resource_type}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">{entry.resource_name || '-'}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-xs">
                      {entry.details ? JSON.stringify(entry.details) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {data && data.total > 0 && (
        <Pagination
          pageIndex={pageIndex}
          pageCount={Math.ceil(data.total / pageSize)}
          pageSize={pageSize}
          onPageChange={setPageIndex}
          onPageSizeChange={setPageSize}
          totalItems={data.total}
        />
      )}
    </div>
  );
}
