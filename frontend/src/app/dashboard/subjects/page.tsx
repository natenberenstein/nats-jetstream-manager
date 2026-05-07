'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, GitBranch, Search } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams } from '@/hooks/useStreams';
import { useAllConsumers } from '@/hooks/useConsumers';
import { analyzeSubjects, subjectMatches } from '@/lib/subject-analysis';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LastUpdated } from '@/components/ui/last-updated';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function relationshipLabel(value: string) {
  switch (value) {
    case 'exact':
      return 'exact';
    case 'consumer-covers-stream':
      return 'consumer broader';
    case 'stream-covers-consumer':
      return 'consumer narrower';
    case 'left-covers-right':
      return 'left broader';
    case 'right-covers-left':
      return 'right broader';
    default:
      return 'overlap';
  }
}

export default function SubjectExplorerPage() {
  const { connectionId } = useConnection();
  const {
    data: streamsData,
    isLoading,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useStreams(connectionId);
  const streams = useMemo(() => streamsData?.streams ?? [], [streamsData?.streams]);
  const streamNames = useMemo(() => streams.map((stream) => stream.config.name), [streams]);
  const allConsumers = useAllConsumers(connectionId, streamNames);
  const [query, setQuery] = useState('');
  const [probeSubject, setProbeSubject] = useState('');

  const analysis = useMemo(
    () => analyzeSubjects(streams, allConsumers.consumers),
    [allConsumers.consumers, streams],
  );

  const filteredStreamSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return analysis.streamSubjects;
    return analysis.streamSubjects.filter(
      (item) =>
        item.streamName.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q) ||
        item.consumers.some(
          (consumer) =>
            consumer.consumerName.toLowerCase().includes(q) ||
            consumer.consumerFilter.toLowerCase().includes(q),
        ),
    );
  }, [analysis.streamSubjects, query]);

  const probeMatches = useMemo(() => {
    const subject = probeSubject.trim();
    if (!subject) return null;
    return {
      streams: streams.filter((stream) =>
        stream.config.subjects.some((pattern) => subjectMatches(pattern, subject)),
      ),
      consumers: allConsumers.consumers.filter((item) => {
        const stream = streams.find((candidate) => candidate.config.name === item.streamName);
        const streamMatches = stream?.config.subjects.some((pattern) =>
          subjectMatches(pattern, subject),
        );
        const filter = item.consumer.config.filter_subject;
        return streamMatches && (!filter || subjectMatches(filter, subject));
      }),
    };
  }, [allConsumers.consumers, probeSubject, streams]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Subject Explorer"
        description="Trace subject patterns across streams and consumers"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching || allConsumers.isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter subjects..."
              className="w-64 pl-8"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Subject Patterns</p>
          <p className="mt-1 text-2xl font-semibold">{analysis.streamSubjects.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Orphan Patterns</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {analysis.orphanStreamSubjects.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Unmatched Filters</p>
          <p className="mt-1 text-2xl font-semibold text-destructive">
            {analysis.unmatchedConsumerFilters.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Cross-Stream Overlaps</p>
          <p className="mt-1 text-2xl font-semibold">{analysis.overlappingStreamSubjects.length}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitBranch className="h-4 w-4" />
            Subject Probe
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={probeSubject}
            onChange={(event) => setProbeSubject(event.target.value)}
            placeholder="orders.created.us"
            className="max-w-md"
          />
          {probeMatches && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Matching Streams</p>
                <div className="flex flex-wrap gap-2">
                  {probeMatches.streams.length ? (
                    probeMatches.streams.map((stream) => (
                      <Link
                        key={stream.config.name}
                        href={`/dashboard/streams/${encodeURIComponent(stream.config.name)}`}
                      >
                        <Badge variant="outline">{stream.config.name}</Badge>
                      </Link>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Matching Consumers</p>
                <div className="flex flex-wrap gap-2">
                  {probeMatches.consumers.length ? (
                    probeMatches.consumers.map((item) => (
                      <Link
                        key={`${item.streamName}:${item.consumer.name}`}
                        href={`/dashboard/consumers/${encodeURIComponent(item.streamName)}/${encodeURIComponent(item.consumer.name)}`}
                      >
                        <Badge variant="secondary">{item.consumer.name}</Badge>
                      </Link>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Impact Map</CardTitle>
        </CardHeader>
        {isLoading || allConsumers.isLoading ? (
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Consumers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStreamSubjects.map((item) => (
                  <TableRow key={`${item.streamName}:${item.subject}`}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/streams/${encodeURIComponent(item.streamName)}`}
                        className="text-primary hover:underline"
                      >
                        {item.streamName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.subject}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatNumber(item.messages)} msgs · {formatBytes(item.bytes)}
                    </TableCell>
                    <TableCell>
                      {item.consumers.length ? (
                        <div className="flex flex-wrap gap-2">
                          {item.consumers.map((consumer) => (
                            <Link
                              key={`${consumer.streamName}:${consumer.consumerName}:${consumer.consumerFilter}`}
                              href={`/dashboard/consumers/${encodeURIComponent(consumer.streamName)}/${encodeURIComponent(consumer.consumerName)}`}
                            >
                              <Badge variant="outline" className="gap-1">
                                {consumer.consumerName}
                                <span className="text-muted-foreground">
                                  {relationshipLabel(consumer.relationship)}
                                </span>
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <Badge variant="warning">no matching consumers</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Unmatched Consumer Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {analysis.unmatchedConsumerFilters.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Consumer</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Filter</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.unmatchedConsumerFilters.map((item) => (
                    <TableRow key={`${item.streamName}:${item.consumerName}`}>
                      <TableCell>
                        <Link
                          href={`/dashboard/consumers/${encodeURIComponent(item.streamName)}/${encodeURIComponent(item.consumerName)}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.consumerName}
                        </Link>
                      </TableCell>
                      <TableCell>{item.streamName}</TableCell>
                      <TableCell className="font-mono text-xs">{item.filterSubject}</TableCell>
                      <TableCell className="text-right">{formatNumber(item.pending)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">No unmatched filters found.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cross-Stream Overlaps</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {analysis.overlappingStreamSubjects.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Left</TableHead>
                    <TableHead>Right</TableHead>
                    <TableHead>Relationship</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.overlappingStreamSubjects.map((item) => (
                    <TableRow
                      key={`${item.leftStream}:${item.leftSubject}:${item.rightStream}:${item.rightSubject}`}
                    >
                      <TableCell>
                        <div className="font-medium">{item.leftStream}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {item.leftSubject}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.rightStream}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {item.rightSubject}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{relationshipLabel(item.relationship)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                No cross-stream subject overlaps found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
