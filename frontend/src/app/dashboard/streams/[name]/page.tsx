'use client';

import { use } from 'react';
import Link from 'next/link';
import { useConnection } from '@/contexts/ConnectionContext';
import { useStream } from '@/hooks/useStreams';
import { useConsumers } from '@/hooks/useConsumers';
import { formatBytes, formatNumber } from '@/lib/utils';
import { ArrowLeft, Users, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function StreamDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const streamName = decodeURIComponent(name);
  const { connectionId } = useConnection();
  const { data: stream, isLoading, refetch } = useStream(connectionId, streamName);
  const { data: consumersData } = useConsumers(connectionId, streamName);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stream details...</div>;
  }

  if (!stream) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Stream &ldquo;{streamName}&rdquo; not found.
      </div>
    );
  }

  const config = stream.config;
  const state = stream.state;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/streams">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{config.name}</h1>
            {config.description && <p className="text-muted-foreground">{config.description}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Link href={`/dashboard/consumers?stream=${encodeURIComponent(streamName)}`}>
            <Button variant="outline">
              <Users className="w-4 h-4" />
              View Consumers
            </Button>
          </Link>
          <Link href={`/dashboard/messages?stream=${encodeURIComponent(streamName)}`}>
            <Button variant="outline">
              <MessageSquare className="w-4 h-4" />
              View Messages
            </Button>
          </Link>
        </div>
      </div>

      {/* State Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Messages</p>
            <p className="text-2xl font-semibold">{formatNumber(state.messages)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="text-2xl font-semibold">{formatBytes(state.bytes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Consumers</p>
            <p className="text-2xl font-semibold">{state.consumer_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sequence Range</p>
            <p className="text-2xl font-semibold">
              {state.first_seq} - {state.last_seq}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mirror & Sources */}
      {config.mirror && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mirror</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-md">
                Mirror
              </Badge>
              <Link
                href={`/dashboard/streams/${encodeURIComponent(config.mirror.name)}`}
                className="text-primary hover:underline font-medium"
              >
                {config.mirror.name}
              </Link>
              {config.mirror.filter_subject && (
                <span className="text-sm text-muted-foreground">
                  (filter: {config.mirror.filter_subject})
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {config.sources && config.sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {config.sources.map((source) => (
                <div key={source.name} className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">
                    Source
                  </Badge>
                  <Link
                    href={`/dashboard/streams/${encodeURIComponent(source.name)}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {source.name}
                  </Link>
                  {source.filter_subject && (
                    <span className="text-sm text-muted-foreground">
                      (filter: {source.filter_subject})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium w-48">Subjects</TableCell>
                <TableCell>{config.subjects.join(', ')}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Storage</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-md">
                    {config.storage}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Retention</TableCell>
                <TableCell>{config.retention}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Discard Policy</TableCell>
                <TableCell>{config.discard}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Replicas</TableCell>
                <TableCell>{config.replicas}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Consumers</TableCell>
                <TableCell>
                  {config.max_consumers === -1 ? 'Unlimited' : config.max_consumers}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Messages</TableCell>
                <TableCell>
                  {config.max_msgs === -1 ? 'Unlimited' : formatNumber(config.max_msgs ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Bytes</TableCell>
                <TableCell>
                  {config.max_bytes === -1 ? 'Unlimited' : formatBytes(config.max_bytes ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Age</TableCell>
                <TableCell>{config.max_age === 0 ? 'Unlimited' : `${config.max_age}s`}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Max Message Size</TableCell>
                <TableCell>
                  {config.max_msg_size === -1 ? 'Unlimited' : formatBytes(config.max_msg_size ?? 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Created</TableCell>
                <TableCell>{new Date(stream.created).toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Consumers List */}
      {consumersData && consumersData.consumers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Consumers ({consumersData.consumers.length})
              </CardTitle>
              <Link href={`/dashboard/consumers?stream=${encodeURIComponent(streamName)}`}>
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Ack Policy</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Ack Pending</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumersData.consumers.slice(0, 10).map((consumer) => (
                  <TableRow key={consumer.name}>
                    <TableCell className="font-medium">{consumer.name}</TableCell>
                    <TableCell>{consumer.config.ack_policy}</TableCell>
                    <TableCell>{consumer.num_pending}</TableCell>
                    <TableCell>{consumer.num_ack_pending}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(consumer.created).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
