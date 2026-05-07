'use client';

import { useMemo, useState } from 'react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useAllConsumers } from '@/hooks/useConsumers';
import { useStreams } from '@/hooks/useStreams';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LastUpdated } from '@/components/ui/last-updated';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ResourceType = 'stream' | 'consumer';

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (value === null || value === undefined) return { [prefix || 'value']: String(value) };
  if (Array.isArray(value)) {
    return { [prefix || 'value']: JSON.stringify(value) };
  }
  if (typeof value !== 'object') return { [prefix || 'value']: String(value) };

  const output: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(output, flatten(nested, nextPrefix));
      return;
    }
    output[nextPrefix] = Array.isArray(nested) ? JSON.stringify(nested) : String(nested);
  });
  return output;
}

export default function ConfigDiffPage() {
  const { connectionId } = useConnection();
  const { data: streamsData, isFetching, dataUpdatedAt, refetch } = useStreams(connectionId);
  const streams = useMemo(() => streamsData?.streams ?? [], [streamsData?.streams]);
  const streamNames = useMemo(() => streams.map((stream) => stream.config.name), [streams]);
  const allConsumers = useAllConsumers(connectionId, streamNames);
  const [resourceType, setResourceType] = useState<ResourceType>('stream');
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');

  const resources = useMemo(() => {
    if (resourceType === 'stream') {
      return streams.map((stream) => ({
        id: stream.config.name,
        label: stream.config.name,
        config: stream.config,
      }));
    }
    return allConsumers.consumers.map((item) => ({
      id: `${item.streamName}/${item.consumer.name}`,
      label: `${item.streamName} / ${item.consumer.name}`,
      config: item.consumer.config,
    }));
  }, [allConsumers.consumers, resourceType, streams]);

  const diffRows = useMemo(() => {
    const left = resources.find((resource) => resource.id === leftId);
    const right = resources.find((resource) => resource.id === rightId);
    if (!left || !right) return [];
    const leftFlat = flatten(left.config);
    const rightFlat = flatten(right.config);
    const keys = Array.from(new Set([...Object.keys(leftFlat), ...Object.keys(rightFlat)])).sort();
    return keys
      .map((key) => ({
        key,
        left: leftFlat[key] ?? '-',
        right: rightFlat[key] ?? '-',
        changed: leftFlat[key] !== rightFlat[key],
      }))
      .filter((row) => row.changed);
  }, [leftId, resources, rightId]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Config Diff"
        description="Compare stream and consumer configuration"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching || allConsumers.isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <Select
              value={resourceType}
              onValueChange={(value) => {
                setResourceType(value as ResourceType);
                setLeftId('');
                setRightId('');
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stream">Streams</SelectItem>
                <SelectItem value="consumer">Consumers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Left config" />
              </SelectTrigger>
              <SelectContent>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Right config" />
              </SelectTrigger>
              <SelectContent>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            Differences
            {leftId && rightId && (
              <Badge variant={diffRows.length ? 'warning' : 'success'}>
                {diffRows.length ? `${diffRows.length} changed` : 'identical'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leftId && rightId ? (
            diffRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Left</TableHead>
                    <TableHead>Right</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diffRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-mono text-xs">{row.key}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.left}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.right}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Selected configs are identical.
              </div>
            )
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Select two configs to compare.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
