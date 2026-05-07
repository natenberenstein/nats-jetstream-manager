'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import { GitFork, Network } from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useClusterOverview } from '@/hooks/useCluster';
import { useAllConsumers } from '@/hooks/useConsumers';
import { useStreams } from '@/hooks/useStreams';
import { subjectPatternsOverlap } from '@/lib/subject-analysis';
import { formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LastUpdated } from '@/components/ui/last-updated';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type TopologyNodeData = {
  label: string;
  detail?: string;
};

function makeNode(
  id: string,
  label: string,
  detail: string,
  x: number,
  y: number,
  className: string,
): Node<TopologyNodeData> {
  return {
    id,
    position: { x, y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label, detail },
    className,
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
  animated = false,
): Edge {
  return {
    id,
    source,
    target,
    label,
    animated,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.5 },
  };
}

function nodeLabel(data: TopologyNodeData) {
  return (
    <div className="min-w-[150px]">
      <div className="truncate text-sm font-semibold">{data.label}</div>
      {data.detail && <div className="truncate text-xs text-muted-foreground">{data.detail}</div>}
    </div>
  );
}

const STREAM_LANE_MIN_HEIGHT = 180;
const STREAM_LANE_GAP = 64;
const NODE_VERTICAL_GAP = 112;
const SUBJECT_COLUMN_X = 660;
const CONSUMER_COLUMN_X = 980;

export default function TopologyPage() {
  const { connectionId } = useConnection();
  const { data: streamsData, isFetching, dataUpdatedAt, refetch } = useStreams(connectionId);
  const { data: clusterData } = useClusterOverview(connectionId);
  const streams = useMemo(() => streamsData?.streams ?? [], [streamsData?.streams]);
  const streamNames = useMemo(() => streams.map((stream) => stream.config.name), [streams]);
  const allConsumers = useAllConsumers(connectionId, streamNames);
  const [showSubjects, setShowSubjects] = useState(true);

  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node<TopologyNodeData>[] = [];
    const graphEdges: Edge[] = [];
    const consumersByStream = new Map<string, number>();

    allConsumers.consumers.forEach((item) => {
      consumersByStream.set(item.streamName, (consumersByStream.get(item.streamName) ?? 0) + 1);
    });

    const streamLaneTop = new Map<string, number>();
    let laneCursor = 0;
    streams.forEach((stream) => {
      const subjectCount = showSubjects ? Math.max(1, stream.config.subjects.length) : 1;
      const consumerCount = Math.max(1, consumersByStream.get(stream.config.name) ?? 0);
      const laneHeight = Math.max(
        STREAM_LANE_MIN_HEIGHT,
        Math.max(subjectCount, consumerCount) * NODE_VERTICAL_GAP,
      );
      streamLaneTop.set(stream.config.name, laneCursor);
      laneCursor += laneHeight + STREAM_LANE_GAP;
    });

    graphNodes.push(
      makeNode(
        'cluster:root',
        clusterData?.cluster_name || 'NATS Cluster',
        `${clusterData?.topology || 'unknown'} · ${formatNumber(streams.length)} streams`,
        0,
        0,
        'border-primary bg-background text-foreground shadow-sm',
      ),
    );

    (clusterData?.nodes ?? []).slice(0, 12).forEach((node, index) => {
      const id = `node:${node.name}`;
      graphNodes.push(
        makeNode(
          id,
          node.name,
          `${node.role || 'node'} · ${node.offline ? 'offline' : 'online'}`,
          0,
          120 + index * 92,
          node.offline
            ? 'border-destructive bg-background text-foreground'
            : 'border-border bg-background text-foreground',
        ),
      );
      graphEdges.push(
        makeEdge(`edge:${id}:cluster`, id, 'cluster:root', node.current ? 'current' : undefined),
      );
    });

    streams.forEach((stream) => {
      const id = `stream:${stream.config.name}`;
      const laneTop = streamLaneTop.get(stream.config.name) ?? 0;
      const unhealthy = clusterData?.stream_health?.find(
        (health) => health.stream === stream.config.name && !health.healthy,
      );
      graphNodes.push(
        makeNode(
          id,
          stream.config.name,
          `${formatNumber(stream.state.messages)} msgs · ${formatBytes(stream.state.bytes)}`,
          360,
          laneTop,
          unhealthy
            ? 'border-warning bg-background text-foreground shadow-sm'
            : 'border-blue-300 bg-background text-foreground shadow-sm dark:border-blue-700',
        ),
      );
      graphEdges.push(makeEdge(`edge:cluster:${id}`, 'cluster:root', id));

      if (stream.config.mirror?.name) {
        const sourceId = `stream:${stream.config.mirror.name}`;
        graphEdges.push(makeEdge(`edge:mirror:${sourceId}:${id}`, sourceId, id, 'mirror', true));
      }

      stream.config.sources?.forEach((source) => {
        const sourceId = `stream:${source.name}`;
        graphEdges.push(makeEdge(`edge:source:${sourceId}:${id}`, sourceId, id, 'source', true));
      });

      if (showSubjects) {
        stream.config.subjects.forEach((subject, subjectIndex) => {
          const subjectId = `subject:${stream.config.name}:${subject}`;
          graphNodes.push(
            makeNode(
              subjectId,
              subject,
              stream.config.name,
              SUBJECT_COLUMN_X,
              laneTop + subjectIndex * NODE_VERTICAL_GAP,
              'border-emerald-300 bg-background font-mono text-foreground dark:border-emerald-700',
            ),
          );
          graphEdges.push(makeEdge(`edge:${id}:${subjectId}`, id, subjectId));
        });
      }
    });

    const consumerPositions = new Map<string, number>();
    allConsumers.consumers.forEach((item) => {
      const position = consumerPositions.get(item.streamName) ?? 0;
      consumerPositions.set(item.streamName, position + 1);
      const laneTop = streamLaneTop.get(item.streamName) ?? 0;
      const consumerId = `consumer:${item.streamName}:${item.consumer.name}`;
      graphNodes.push(
        makeNode(
          consumerId,
          item.consumer.name,
          `${item.consumer.config.filter_subject || '*'} · pending ${formatNumber(item.consumer.num_pending)}`,
          CONSUMER_COLUMN_X,
          laneTop + position * NODE_VERTICAL_GAP,
          item.consumer.num_ack_pending > 0
            ? 'border-warning bg-background text-foreground shadow-sm'
            : 'border-violet-300 bg-background text-foreground shadow-sm dark:border-violet-700',
        ),
      );

      const stream = streams.find((candidate) => candidate.config.name === item.streamName);
      if (!stream) return;

      if (showSubjects) {
        const filter = item.consumer.config.filter_subject;
        stream.config.subjects
          .filter((subject) => !filter || subjectPatternsOverlap(subject, filter))
          .forEach((subject) => {
            const subjectId = `subject:${stream.config.name}:${subject}`;
            graphEdges.push(
              makeEdge(
                `edge:${subjectId}:${consumerId}`,
                subjectId,
                consumerId,
                filter && filter !== subject ? filter : undefined,
              ),
            );
          });
      } else {
        graphEdges.push(
          makeEdge(
            `edge:stream:${item.streamName}:${consumerId}`,
            `stream:${item.streamName}`,
            consumerId,
          ),
        );
      }
    });

    return {
      nodes: graphNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          label: nodeLabel(node.data),
        } as unknown as TopologyNodeData,
      })),
      edges: graphEdges,
    };
  }, [allConsumers.consumers, clusterData, showSubjects, streams]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Topology"
        description="Cluster, stream, subject, mirror/source, and consumer relationships"
        meta={
          <LastUpdated
            timestamp={dataUpdatedAt}
            isFetching={isFetching || allConsumers.isFetching}
            onRefresh={() => refetch()}
          />
        }
        actions={
          <>
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Switch id="show-subjects" checked={showSubjects} onCheckedChange={setShowSubjects} />
              <Label htmlFor="show-subjects" className="text-sm">
                Subjects
              </Label>
            </div>
            <Link href="/dashboard/subjects">
              <Button variant="outline">
                <GitFork className="h-4 w-4" />
                Subject Explorer
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Nodes</p>
          <p className="mt-1 text-2xl font-semibold">{nodes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Edges</p>
          <p className="mt-1 text-2xl font-semibold">{edges.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Streams</p>
          <p className="mt-1 text-2xl font-semibold">{streams.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Consumers</p>
          <p className="mt-1 text-2xl font-semibold">{allConsumers.consumers.length}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="h-[720px] p-0">
          {nodes.length > 1 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Network className="mr-2 h-4 w-4" />
              No topology data available.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">blue: stream</Badge>
        <Badge variant="outline">green: subject</Badge>
        <Badge variant="outline">violet: consumer</Badge>
        <Badge variant="warning">warning: lag or degraded replication</Badge>
      </div>
    </div>
  );
}
