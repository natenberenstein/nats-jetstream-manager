'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  GitFork,
  Layers,
  Maximize2,
  MoreHorizontal,
  Network,
  RotateCcw,
  Search,
  Server,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { useConnection } from '@/contexts/ConnectionContext';
import { useClusterOverview } from '@/hooks/useCluster';
import { useAllConsumers } from '@/hooks/useConsumers';
import { useIsMobile } from '@/hooks/use-mobile';
import { useStreams } from '@/hooks/useStreams';
import { subjectPatternsOverlap } from '@/lib/subject-analysis';
import { cn, formatBytes, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/cards/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { LastUpdated } from '@/components/ui/last-updated';
import { PageHeader } from '@/components/ui/page-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type TopologyNodeKind = 'cluster' | 'server' | 'stream' | 'subject' | 'consumer';
type TopologyNodeStatus = 'neutral' | 'ok' | 'warning' | 'error';

type TopologyNodeData = {
  kind: TopologyNodeKind;
  status: TopologyNodeStatus;
  title: string;
  detail?: string;
  subdetail?: string;
  compactDetail?: string;
  tooltipDetail?: string;
  searchText: string;
  contextNodeIds: string[];
  hasIssue: boolean;
  matched: boolean;
  dimmed: boolean;
  compact: boolean;
  streamName?: string;
  subject?: string;
  consumerName?: string;
  filterSubject?: string;
};

type TopologyFlowNode = Node<TopologyNodeData, 'topology'>;
type TopologyEdge = Edge<{ rawLabel?: string }>;

type ToggleOption = {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

type MultiSelectOption = {
  value: string;
  label: string;
  detail?: string;
  searchText?: string;
};

type MultiSelectFilterProps = {
  label: string;
  icon: LucideIcon;
  options: MultiSelectOption[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  emptyText: string;
};

const ROOT_NODE_ID = 'cluster:root';
const ROOT_COLUMN_X = 0;
const SERVER_COLUMN_X = -300;
const STREAM_COLUMN_X = 360;
const STREAM_LANE_MIN_HEIGHT = 180;
const STREAM_LANE_GAP = 64;
const NODE_VERTICAL_GAP = 112;
const SUBJECT_COLUMN_X = 660;
const CONSUMER_COLUMN_X = 980;
const SERVER_VERTICAL_GAP = 92;
const TOPOLOGY_NODE_TYPES = { topology: TopologyNode };

function streamNodeId(streamName: string) {
  return `stream:${streamName}`;
}

function subjectNodeId(streamName: string, subject: string) {
  return `subject:${streamName}:${subject}`;
}

function consumerNodeId(streamName: string, consumerName: string) {
  return `consumer:${streamName}:${consumerName}`;
}

function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(searchText: string, query: string) {
  if (!query) return false;
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => searchText.includes(token));
}

function searchText(...parts: Array<string | number | boolean | null | undefined>) {
  return parts
    .filter((part): part is string | number | boolean => part !== null && part !== undefined)
    .join(' ')
    .toLowerCase();
}

function makeNode({
  id,
  kind,
  status = 'ok',
  title,
  detail,
  subdetail,
  compactDetail,
  tooltipDetail,
  x = 0,
  y = 0,
  searchParts,
  contextNodeIds = [],
  hasIssue,
  streamName,
  subject,
  consumerName,
  filterSubject,
}: {
  id: string;
  kind: TopologyNodeKind;
  status?: TopologyNodeStatus;
  title: string;
  detail?: string;
  subdetail?: string;
  compactDetail?: string;
  tooltipDetail?: string;
  x?: number;
  y?: number;
  searchParts: Array<string | number | boolean | null | undefined>;
  contextNodeIds?: string[];
  hasIssue?: boolean;
  streamName?: string;
  subject?: string;
  consumerName?: string;
  filterSubject?: string;
}): TopologyFlowNode {
  return {
    id,
    type: 'topology',
    position: { x, y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      kind,
      status,
      title,
      detail,
      subdetail,
      compactDetail,
      tooltipDetail,
      searchText: searchText(kind, title, detail, subdetail, tooltipDetail, ...searchParts),
      contextNodeIds,
      hasIssue: hasIssue ?? (status === 'warning' || status === 'error'),
      matched: false,
      dimmed: false,
      compact: false,
      streamName,
      subject,
      consumerName,
      filterSubject,
    },
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  label?: string,
  animated = false,
): TopologyEdge {
  return {
    id,
    source,
    target,
    label,
    animated,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.5 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    data: { rawLabel: label },
  };
}

function collectContextNodeIds(
  seedNodeIds: Set<string>,
  edges: TopologyEdge[],
  nodeById: Map<string, TopologyFlowNode>,
) {
  const contextNodeIds = new Set<string>([ROOT_NODE_ID, ...seedNodeIds]);

  seedNodeIds.forEach((nodeId) => {
    const node = nodeById.get(nodeId);
    node?.data.contextNodeIds.forEach((contextNodeId) => contextNodeIds.add(contextNodeId));

    edges.forEach((edge) => {
      if (edge.source === nodeId) contextNodeIds.add(edge.target);
      if (edge.target === nodeId) contextNodeIds.add(edge.source);
    });
  });

  return contextNodeIds;
}

function intersectNodeIds(left: Set<string>, right: Set<string>) {
  return new Set([...left].filter((nodeId) => right.has(nodeId)));
}

function toggleSelectedValue(values: string[], value: string, checked?: boolean) {
  const selected = new Set(values);
  const shouldSelect = checked ?? !selected.has(value);

  if (shouldSelect) {
    selected.add(value);
  } else {
    selected.delete(value);
  }

  return values
    .filter((item) => selected.has(item))
    .concat([...selected].filter((item) => !values.includes(item)));
}

function pruneSelectedValues(values: string[], validValues: string[]) {
  const valid = new Set(validValues);
  const nextValues = values.filter((value) => valid.has(value));
  return nextValues.length === values.length ? values : nextValues;
}

function consumerFilterLabel(filterSubject?: string) {
  return filterSubject?.trim() || 'all subjects';
}

function consumerMatchesSubject(subject: string, filterSubject?: string) {
  if (!filterSubject?.trim()) return true;
  return subjectPatternsOverlap(subject, filterSubject);
}

function layoutVisibleNodes(nodes: TopologyFlowNode[], streamOrder: string[]) {
  const subjectsByStream = new Map<string, TopologyFlowNode[]>();
  const consumersByStream = new Map<string, TopologyFlowNode[]>();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const streamNames = streamOrder.filter((streamName) => nodeIds.has(streamNodeId(streamName)));

  nodes.forEach((node) => {
    const streamName = node.data.streamName;
    if (!streamName) return;
    if (node.data.kind === 'subject') {
      subjectsByStream.set(streamName, [...(subjectsByStream.get(streamName) ?? []), node]);
    }
    if (node.data.kind === 'consumer') {
      consumersByStream.set(streamName, [...(consumersByStream.get(streamName) ?? []), node]);
    }
  });

  const streamLaneTop = new Map<string, number>();
  let laneCursor = 0;

  streamNames.forEach((streamName) => {
    const subjectCount = subjectsByStream.get(streamName)?.length ?? 0;
    const consumerCount = consumersByStream.get(streamName)?.length ?? 0;
    const laneHeight = Math.max(
      STREAM_LANE_MIN_HEIGHT,
      Math.max(1, subjectCount, consumerCount) * NODE_VERTICAL_GAP,
    );

    streamLaneTop.set(streamName, laneCursor);
    laneCursor += laneHeight + STREAM_LANE_GAP;
  });

  const graphHeight =
    streamNames.length > 0 ? Math.max(STREAM_LANE_MIN_HEIGHT, laneCursor - STREAM_LANE_GAP) : 0;
  const rootY = Math.max(0, graphHeight / 2 - 38);
  const serverNodes = nodes.filter((node) => node.data.kind === 'server');
  const serverStartY = Math.max(0, rootY - ((serverNodes.length - 1) * SERVER_VERTICAL_GAP) / 2);

  return nodes.map((node) => {
    if (node.data.kind === 'cluster') {
      return { ...node, position: { x: ROOT_COLUMN_X, y: rootY } };
    }

    if (node.data.kind === 'server') {
      const serverIndex = serverNodes.findIndex((serverNode) => serverNode.id === node.id);
      return {
        ...node,
        position: { x: SERVER_COLUMN_X, y: serverStartY + serverIndex * SERVER_VERTICAL_GAP },
      };
    }

    if (node.data.kind === 'stream' && node.data.streamName) {
      return {
        ...node,
        position: { x: STREAM_COLUMN_X, y: streamLaneTop.get(node.data.streamName) ?? 0 },
      };
    }

    if (node.data.kind === 'subject' && node.data.streamName) {
      const subjectIndex =
        subjectsByStream
          .get(node.data.streamName)
          ?.findIndex((subjectNode) => subjectNode.id === node.id) ?? 0;

      return {
        ...node,
        position: {
          x: SUBJECT_COLUMN_X,
          y: (streamLaneTop.get(node.data.streamName) ?? 0) + subjectIndex * NODE_VERTICAL_GAP,
        },
      };
    }

    if (node.data.kind === 'consumer' && node.data.streamName) {
      const consumerIndex =
        consumersByStream
          .get(node.data.streamName)
          ?.findIndex((consumerNode) => consumerNode.id === node.id) ?? 0;

      return {
        ...node,
        position: {
          x: CONSUMER_COLUMN_X,
          y: (streamLaneTop.get(node.data.streamName) ?? 0) + consumerIndex * NODE_VERTICAL_GAP,
        },
      };
    }

    return node;
  });
}

function topologyNodeClassName(data: TopologyNodeData, selected: boolean) {
  const kindClassName: Record<TopologyNodeKind, string> = {
    cluster: 'border-primary',
    server: 'border-border',
    stream: 'border-blue-300 dark:border-blue-700',
    subject: 'border-emerald-300 font-mono dark:border-emerald-700',
    consumer: 'border-violet-300 dark:border-violet-700',
  };

  const statusClassName: Partial<Record<TopologyNodeStatus, string>> = {
    warning: 'border-warning',
    error: 'border-destructive',
  };

  return cn(
    'relative overflow-hidden rounded-md border bg-background text-foreground shadow-sm',
    'transition-[box-shadow,opacity,border-color] duration-150',
    data.compact ? 'min-h-[54px] w-[190px] px-3 py-2' : 'min-h-[76px] w-[244px] px-3 py-2.5',
    kindClassName[data.kind],
    statusClassName[data.status],
    data.matched && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background',
    data.dimmed && 'opacity-45',
    selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
  );
}

function statusDotClassName(status: TopologyNodeStatus) {
  if (status === 'error') return 'bg-destructive';
  if (status === 'warning') return 'bg-warning';
  if (status === 'neutral') return 'bg-primary';
  return 'bg-success';
}

function TopologyNode({ data, selected }: NodeProps<TopologyFlowNode>) {
  const displayDetail = data.compact ? data.compactDetail : data.detail;
  const displaySubdetail = data.compact ? undefined : data.subdetail;
  const tooltipText =
    data.tooltipDetail || [displayDetail, displaySubdetail].filter(Boolean).join('\n');
  const titleText = [data.title, tooltipText].filter(Boolean).join('\n');

  return (
    <div className={topologyNodeClassName(data, selected)} title={titleText}>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-background"
      />

      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span
          aria-hidden="true"
          className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClassName(data.status))}
        />
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase text-muted-foreground">
          {data.kind}
        </span>
        {data.hasIssue && <AlertTriangle className="ml-auto h-3.5 w-3.5 shrink-0 text-warning" />}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mt-1 min-w-0 overflow-hidden">
            <div className="truncate text-sm font-semibold leading-5">{data.title}</div>
            {displayDetail && (
              <div className="truncate text-xs leading-5 text-muted-foreground">
                {displayDetail}
              </div>
            )}
            {displaySubdetail && (
              <div className="truncate text-xs leading-5 text-muted-foreground">
                {displaySubdetail}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-80 whitespace-pre-wrap break-words">
          <div className="font-medium">{data.title}</div>
          {tooltipText && <div className="text-primary-foreground/80">{tooltipText}</div>}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function ControlSwitch({ id, label, checked, onCheckedChange }: ToggleOption) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border px-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="whitespace-nowrap text-sm">
        {label}
      </Label>
    </div>
  );
}

function MultiSelectFilter({
  label,
  icon: Icon,
  options,
  selectedValues,
  onSelectionChange,
  emptyText,
}: MultiSelectFilterProps) {
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const optionByValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const selectedLabel =
    selectedValues.length === 0
      ? label
      : selectedValues.length === 1
        ? (optionByValue.get(selectedValues[0])?.label ?? label)
        : `${label} (${selectedValues.length})`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-between gap-2 sm:w-[13rem]"
          disabled={options.length === 0}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Filter ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const selected = selectedSet.has(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.value} ${option.label} ${option.detail ?? ''} ${
                      option.searchText ?? ''
                    }`}
                    className="items-start"
                    onSelect={() =>
                      onSelectionChange(toggleSelectedValue(selectedValues, option.value))
                    }
                  >
                    <Checkbox checked={selected} className="pointer-events-none mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{option.label}</div>
                      {option.detail && (
                        <div className="truncate text-xs text-muted-foreground">
                          {option.detail}
                        </div>
                      )}
                    </div>
                    {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selectedValues.length > 0 && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => onSelectionChange([])}
              >
                <X className="h-4 w-4" />
                Clear {label.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MobileMultiSelectMenu({
  label,
  icon: Icon,
  options,
  selectedValues,
  onSelectionChange,
  emptyText,
}: MultiSelectFilterProps) {
  const selectedSet = new Set(selectedValues);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selectedValues.length > 0 && (
          <span className="text-xs text-muted-foreground">{selectedValues.length}</span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.length === 0 ? (
          <DropdownMenuItem disabled>{emptyText}</DropdownMenuItem>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selectedSet.has(option.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onSelectionChange(
                  toggleSelectedValue(selectedValues, option.value, checked === true),
                )
              }
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.detail && (
                <span className="ml-2 max-w-28 truncate text-xs text-muted-foreground">
                  {option.detail}
                </span>
              )}
            </DropdownMenuCheckboxItem>
          ))
        )}
        {selectedValues.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onSelectionChange([]);
              }}
            >
              <X className="h-4 w-4" />
              Clear {label.toLowerCase()}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function setChecked(handler: (checked: boolean) => void) {
  return (checked: boolean | 'indeterminate') => handler(checked === true);
}

export default function TopologyPage() {
  const { connectionId } = useConnection();
  const { data: streamsData, isFetching, dataUpdatedAt, refetch } = useStreams(connectionId);
  const { data: clusterData } = useClusterOverview(connectionId);
  const streams = useMemo(() => streamsData?.streams ?? [], [streamsData?.streams]);
  const streamNames = useMemo(() => streams.map((stream) => stream.config.name), [streams]);
  const allConsumers = useAllConsumers(connectionId, streamNames);
  const consumerItems = allConsumers.consumers;
  const isMobile = useIsMobile();

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<
    TopologyFlowNode,
    TopologyEdge
  > | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showServerNodes, setShowServerNodes] = useState(true);
  const [showSubjects, setShowSubjects] = useState(true);
  const [showConsumers, setShowConsumers] = useState(true);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [compactLabels, setCompactLabels] = useState(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [selectedStreamNames, setSelectedStreamNames] = useState<string[]>([]);
  const [selectedSubjectKeys, setSelectedSubjectKeys] = useState<string[]>([]);
  const [selectedConsumerIds, setSelectedConsumerIds] = useState<string[]>([]);

  const normalizedSearchQuery = normalizeSearchQuery(searchQuery);
  const consumersByStream = useMemo(() => {
    const grouped = new Map<string, number>();

    consumerItems.forEach((item) => {
      grouped.set(item.streamName, (grouped.get(item.streamName) ?? 0) + 1);
    });

    return grouped;
  }, [consumerItems]);

  const streamOptions = useMemo<MultiSelectOption[]>(
    () =>
      streams.map((stream) => ({
        value: stream.config.name,
        label: stream.config.name,
        detail: `${formatNumber(stream.config.subjects.length)} subjects · ${formatNumber(
          consumersByStream.get(stream.config.name) ?? 0,
        )} consumers`,
        searchText: searchText(
          stream.config.description,
          stream.config.subjects.join(' '),
          stream.config.mirror?.name,
          stream.config.sources?.map((source) => source.name).join(' '),
        ),
      })),
    [consumersByStream, streams],
  );

  const subjectOptions = useMemo<MultiSelectOption[]>(() => {
    const streamsBySubject = new Map<string, Set<string>>();

    streams.forEach((stream) => {
      stream.config.subjects.forEach((subject) => {
        const streamNamesForSubject = streamsBySubject.get(subject) ?? new Set<string>();
        streamNamesForSubject.add(stream.config.name);
        streamsBySubject.set(subject, streamNamesForSubject);
      });
    });

    return [...streamsBySubject.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([subject, streamNamesForSubject]) => {
        const ownerStreams = [...streamNamesForSubject].sort();

        return {
          value: subject,
          label: subject,
          detail:
            ownerStreams.length === 1
              ? ownerStreams[0]
              : `${formatNumber(ownerStreams.length)} streams`,
          searchText: ownerStreams.join(' '),
        };
      });
  }, [streams]);

  const consumerOptions = useMemo<MultiSelectOption[]>(
    () =>
      consumerItems
        .map((item) => {
          const filterSubject = consumerFilterLabel(item.consumer.config.filter_subject);

          return {
            value: consumerNodeId(item.streamName, item.consumer.name),
            label: item.consumer.name,
            detail: `${item.streamName} · ${filterSubject}`,
            searchText: searchText(
              item.streamName,
              item.consumer.config.name,
              item.consumer.config.durable_name,
              item.consumer.config.description,
              filterSubject,
            ),
          };
        })
        .sort((left, right) =>
          `${left.detail} ${left.label}`.localeCompare(`${right.detail} ${right.label}`),
        ),
    [consumerItems],
  );

  const selectedStreamSet = useMemo(() => new Set(selectedStreamNames), [selectedStreamNames]);
  const selectedSubjectSet = useMemo(() => new Set(selectedSubjectKeys), [selectedSubjectKeys]);
  const selectedConsumerSet = useMemo(() => new Set(selectedConsumerIds), [selectedConsumerIds]);
  const activeFilterCount =
    selectedStreamNames.length + selectedSubjectKeys.length + selectedConsumerIds.length;
  const clearSelectedFilters = useCallback(() => {
    setSelectedStreamNames([]);
    setSelectedSubjectKeys([]);
    setSelectedConsumerIds([]);
  }, []);

  useEffect(() => {
    setSelectedStreamNames((current) =>
      pruneSelectedValues(
        current,
        streamOptions.map((option) => option.value),
      ),
    );
  }, [streamOptions]);

  useEffect(() => {
    setSelectedSubjectKeys((current) =>
      pruneSelectedValues(
        current,
        subjectOptions.map((option) => option.value),
      ),
    );
  }, [subjectOptions]);

  useEffect(() => {
    setSelectedConsumerIds((current) =>
      pruneSelectedValues(
        current,
        consumerOptions.map((option) => option.value),
      ),
    );
  }, [consumerOptions]);

  const fitGraph = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.18, duration: 300 });
  }, [reactFlowInstance]);

  const resetView = useCallback(() => {
    reactFlowInstance?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  }, [reactFlowInstance]);

  const toggleOptions: ToggleOption[] = [
    {
      id: 'topology-show-servers',
      label: 'Servers',
      checked: showServerNodes,
      onCheckedChange: setShowServerNodes,
    },
    {
      id: 'topology-show-subjects',
      label: 'Subjects',
      checked: showSubjects,
      onCheckedChange: setShowSubjects,
    },
    {
      id: 'topology-show-consumers',
      label: 'Consumers',
      checked: showConsumers,
      onCheckedChange: setShowConsumers,
    },
    {
      id: 'topology-issues-only',
      label: 'Issues only',
      checked: issuesOnly,
      onCheckedChange: setIssuesOnly,
    },
    {
      id: 'topology-compact-labels',
      label: 'Compact labels',
      checked: compactLabels,
      onCheckedChange: setCompactLabels,
    },
    {
      id: 'topology-edge-labels',
      label: 'Show edge labels',
      checked: showEdgeLabels,
      onCheckedChange: setShowEdgeLabels,
    },
  ];

  const { nodes, edges } = useMemo(() => {
    const graphNodes: TopologyFlowNode[] = [];
    const graphEdges: TopologyEdge[] = [];
    const streamByName = new Map(streams.map((stream) => [stream.config.name, stream]));
    const consumersByStreamItems = new Map<string, typeof consumerItems>();
    const unhealthyStreamNames = new Set(
      (clusterData?.stream_health ?? [])
        .filter((health) => !health.healthy)
        .map((health) => health.stream),
    );

    consumerItems.forEach((item) => {
      const streamConsumers = consumersByStreamItems.get(item.streamName) ?? [];
      streamConsumers.push(item);
      consumersByStreamItems.set(item.streamName, streamConsumers);
    });

    graphNodes.push(
      makeNode({
        id: ROOT_NODE_ID,
        kind: 'cluster',
        status: 'neutral',
        title: clusterData?.cluster_name || 'NATS Cluster',
        detail: `${clusterData?.topology || 'unknown'} · ${formatNumber(streams.length)} streams`,
        searchParts: [
          clusterData?.topology,
          clusterData?.connected_server,
          clusterData?.server_version,
          clusterData?.discovered_servers?.join(' '),
          clusterData?.configured_servers?.join(' '),
        ],
        hasIssue: false,
      }),
    );

    (clusterData?.nodes ?? []).slice(0, 12).forEach((node) => {
      const id = `server:${node.name}`;
      graphNodes.push(
        makeNode({
          id,
          kind: 'server',
          status: node.offline ? 'error' : 'ok',
          title: node.name,
          detail: `${node.role || 'node'} · ${node.offline ? 'offline' : 'online'}`,
          searchParts: [node.role, node.offline ? 'offline' : 'online', node.version],
          contextNodeIds: [ROOT_NODE_ID],
          hasIssue: node.offline,
        }),
      );
      graphEdges.push(
        makeEdge(`edge:${id}:cluster`, id, ROOT_NODE_ID, node.current ? 'current' : undefined),
      );
    });

    streams.forEach((stream) => {
      const id = streamNodeId(stream.config.name);
      const streamConsumers = consumersByStreamItems.get(stream.config.name) ?? [];
      const unhealthy = unhealthyStreamNames.has(stream.config.name);

      graphNodes.push(
        makeNode({
          id,
          kind: 'stream',
          status: unhealthy ? 'warning' : 'ok',
          title: stream.config.name,
          detail: `${formatNumber(stream.state.messages)} msgs · ${formatBytes(stream.state.bytes)}`,
          searchParts: [
            stream.config.description,
            stream.config.subjects.join(' '),
            stream.config.mirror?.name,
            stream.config.sources?.map((source) => source.name).join(' '),
            unhealthy ? 'unhealthy replication degraded quorum lag' : 'healthy',
          ],
          contextNodeIds: [ROOT_NODE_ID],
          hasIssue: unhealthy,
          streamName: stream.config.name,
        }),
      );
      graphEdges.push(makeEdge(`edge:cluster:${id}`, ROOT_NODE_ID, id));

      if (stream.config.mirror?.name) {
        const sourceId = streamNodeId(stream.config.mirror.name);
        graphEdges.push(makeEdge(`edge:mirror:${sourceId}:${id}`, sourceId, id, 'mirror', true));
      }

      stream.config.sources?.forEach((source) => {
        const sourceId = streamNodeId(source.name);
        graphEdges.push(makeEdge(`edge:source:${sourceId}:${id}`, sourceId, id, 'source', true));
      });

      stream.config.subjects.forEach((subject) => {
        const subjectId = subjectNodeId(stream.config.name, subject);
        const matchingConsumerIds = streamConsumers
          .filter((item) => consumerMatchesSubject(subject, item.consumer.config.filter_subject))
          .map((item) => consumerNodeId(item.streamName, item.consumer.name));

        graphNodes.push(
          makeNode({
            id: subjectId,
            kind: 'subject',
            title: subject,
            detail: stream.config.name,
            searchParts: [
              subject,
              stream.config.name,
              streamConsumers
                .filter((item) =>
                  consumerMatchesSubject(subject, item.consumer.config.filter_subject),
                )
                .map((item) => item.consumer.name)
                .join(' '),
            ],
            contextNodeIds: [id, ...matchingConsumerIds],
            streamName: stream.config.name,
            subject,
          }),
        );
        graphEdges.push(makeEdge(`edge:${id}:${subjectId}`, id, subjectId));
      });
    });

    consumerItems.forEach((item) => {
      const stream = streamByName.get(item.streamName);
      if (!stream) return;

      const consumerId = consumerNodeId(item.streamName, item.consumer.name);
      const filterSubject = item.consumer.config.filter_subject;
      const filterLabel = consumerFilterLabel(filterSubject);
      const streamId = streamNodeId(item.streamName);
      const hasAckBacklog = item.consumer.num_ack_pending > 0;
      const matchingSubjects = stream.config.subjects.filter((subject) =>
        consumerMatchesSubject(subject, filterSubject),
      );
      const matchingSubjectIds = matchingSubjects.map((subject) =>
        subjectNodeId(stream.config.name, subject),
      );
      const matchingSubjectSummary =
        matchingSubjects.length === 0
          ? 'none'
          : `${matchingSubjects.slice(0, 5).join(', ')}${
              matchingSubjects.length > 5 ? `, +${matchingSubjects.length - 5} more` : ''
            }`;
      const metricDetail = `pending ${formatNumber(item.consumer.num_pending)} · ack ${formatNumber(
        item.consumer.num_ack_pending,
      )} · waiting ${formatNumber(item.consumer.num_waiting)}`;
      const compactMetricDetail = [
        `pending ${formatNumber(item.consumer.num_pending)}`,
        item.consumer.num_ack_pending > 0
          ? `ack ${formatNumber(item.consumer.num_ack_pending)}`
          : null,
        item.consumer.num_waiting > 0 ? `waiting ${formatNumber(item.consumer.num_waiting)}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ');

      graphNodes.push(
        makeNode({
          id: consumerId,
          kind: 'consumer',
          status: hasAckBacklog ? 'warning' : 'ok',
          title: item.consumer.name,
          detail: `filter ${filterLabel}`,
          subdetail: metricDetail,
          compactDetail: compactMetricDetail,
          tooltipDetail: [
            `Stream: ${item.streamName}`,
            `Filter subject: ${filterLabel}`,
            `Matching subjects: ${matchingSubjectSummary}`,
            `Pending: ${formatNumber(item.consumer.num_pending)}`,
            `Ack pending: ${formatNumber(item.consumer.num_ack_pending)}`,
            `Waiting: ${formatNumber(item.consumer.num_waiting)}`,
            `Ack policy: ${item.consumer.config.ack_policy ?? 'unknown'}`,
            `Deliver policy: ${item.consumer.config.deliver_policy ?? 'unknown'}`,
          ].join('\n'),
          searchParts: [
            item.streamName,
            item.consumer.config.name,
            item.consumer.config.durable_name,
            item.consumer.config.description,
            filterLabel,
            matchingSubjectSummary,
            metricDetail,
            hasAckBacklog ? 'ack pending issue lag backlog' : undefined,
          ],
          contextNodeIds: [streamId, ...matchingSubjectIds],
          hasIssue: hasAckBacklog,
          streamName: item.streamName,
          consumerName: item.consumer.name,
          filterSubject: filterLabel,
        }),
      );

      if (showSubjects) {
        matchingSubjects.forEach((subject) => {
          const subjectId = subjectNodeId(stream.config.name, subject);
          graphEdges.push(
            makeEdge(
              `edge:${subjectId}:${consumerId}`,
              subjectId,
              consumerId,
              filterSubject && filterSubject !== subject ? filterSubject : undefined,
            ),
          );
        });
      } else {
        graphEdges.push(makeEdge(`edge:${streamId}:${consumerId}`, streamId, consumerId));
      }
    });

    const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
    const enabledNodeIds = new Set(
      graphNodes
        .filter((node) => {
          if (node.data.kind === 'server') return showServerNodes;
          if (node.data.kind === 'subject') return showSubjects;
          if (node.data.kind === 'consumer') return showConsumers;
          return true;
        })
        .map((node) => node.id),
    );

    let visibleNodeIds = new Set(enabledNodeIds);
    let matchedNodeIds = new Set<string>();

    if (activeFilterCount > 0) {
      const filterSeedNodeIds = new Set<string>();

      selectedStreamSet.forEach((streamName) => {
        filterSeedNodeIds.add(streamNodeId(streamName));
      });

      graphNodes.forEach((node) => {
        if (
          node.data.kind === 'subject' &&
          node.data.subject &&
          selectedSubjectSet.has(node.data.subject)
        ) {
          filterSeedNodeIds.add(node.id);
        }
      });

      selectedConsumerSet.forEach((consumerId) => {
        filterSeedNodeIds.add(consumerId);
      });

      visibleNodeIds = intersectNodeIds(
        enabledNodeIds,
        collectContextNodeIds(filterSeedNodeIds, graphEdges, nodeById),
      );
    }

    if (issuesOnly) {
      const issueNodeIds = new Set(
        graphNodes
          .filter((node) => enabledNodeIds.has(node.id) && node.data.hasIssue)
          .map((node) => node.id),
      );
      const issueContextNodeIds = collectContextNodeIds(issueNodeIds, graphEdges, nodeById);
      visibleNodeIds = intersectNodeIds(visibleNodeIds, issueContextNodeIds);
    }

    if (normalizedSearchQuery) {
      matchedNodeIds = new Set(
        graphNodes
          .filter(
            (node) =>
              visibleNodeIds.has(node.id) &&
              matchesSearch(node.data.searchText, normalizedSearchQuery),
          )
          .map((node) => node.id),
      );
      const searchContextNodeIds = collectContextNodeIds(matchedNodeIds, graphEdges, nodeById);
      visibleNodeIds = intersectNodeIds(visibleNodeIds, searchContextNodeIds);
    }

    const visibleNodes = layoutVisibleNodes(
      graphNodes.filter((node) => visibleNodeIds.has(node.id)),
      streamNames,
    );

    return {
      nodes: visibleNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          matched: normalizedSearchQuery ? matchedNodeIds.has(node.id) : false,
          dimmed: normalizedSearchQuery ? !matchedNodeIds.has(node.id) : false,
          compact: compactLabels,
        },
      })),
      edges: graphEdges
        .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
        .map((edge) => ({
          ...edge,
          label: showEdgeLabels ? edge.data?.rawLabel : undefined,
        })),
    };
  }, [
    consumerItems,
    clusterData,
    compactLabels,
    activeFilterCount,
    issuesOnly,
    normalizedSearchQuery,
    selectedConsumerSet,
    selectedStreamSet,
    selectedSubjectSet,
    showConsumers,
    showEdgeLabels,
    showServerNodes,
    showSubjects,
    streams,
    streamNames,
  ]);

  const hasTopologyData =
    streams.length > 0 || (clusterData?.nodes.length ?? 0) > 0 || consumerItems.length > 0;
  const graphActionsDisabled = !reactFlowInstance || nodes.length === 0;
  const graphViewKey = [
    normalizedSearchQuery,
    selectedStreamNames.join('\u001f'),
    selectedSubjectKeys.join('\u001f'),
    selectedConsumerIds.join('\u001f'),
    showServerNodes,
    showSubjects,
    showConsumers,
    issuesOnly,
    compactLabels,
  ].join('\u001e');

  useEffect(() => {
    if (!reactFlowInstance || nodes.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.18, duration: 250 });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [graphViewKey, nodes.length, reactFlowInstance]);

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
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Nodes" value={nodes.length} icon={Network} metric="topology" />
        <StatCard label="Edges" value={edges.length} icon={GitFork} metric="topology" />
        <StatCard label="Streams" value={streams.length} icon={Layers} metric="streams" />
        <StatCard label="Consumers" value={consumerItems.length} icon={Users} metric="consumers" />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full min-w-0 md:min-w-[280px] md:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search topology"
                className="h-10 pl-9 pr-9"
                aria-label="Search topology"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  aria-label="Clear topology search"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-center md:w-auto">
                    <MoreHorizontal className="h-4 w-4" />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Filters</DropdownMenuLabel>
                  <MobileMultiSelectMenu
                    label="Streams"
                    icon={Layers}
                    options={streamOptions}
                    selectedValues={selectedStreamNames}
                    onSelectionChange={setSelectedStreamNames}
                    emptyText="No streams"
                  />
                  <MobileMultiSelectMenu
                    label="Subjects"
                    icon={GitFork}
                    options={subjectOptions}
                    selectedValues={selectedSubjectKeys}
                    onSelectionChange={setSelectedSubjectKeys}
                    emptyText="No subjects"
                  />
                  <MobileMultiSelectMenu
                    label="Consumers"
                    icon={Users}
                    options={consumerOptions}
                    selectedValues={selectedConsumerIds}
                    onSelectionChange={setSelectedConsumerIds}
                    emptyText="No consumers"
                  />
                  {activeFilterCount > 0 && (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        clearSelectedFilters();
                      }}
                    >
                      <X className="h-4 w-4" />
                      Clear filters
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>View</DropdownMenuLabel>
                  {toggleOptions.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.id}
                      checked={option.checked}
                      onCheckedChange={setChecked(option.onCheckedChange)}
                    >
                      {option.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={graphActionsDisabled} onSelect={fitGraph}>
                    <Maximize2 className="h-4 w-4" />
                    Fit graph
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={graphActionsDisabled} onSelect={resetView}>
                    <RotateCcw className="h-4 w-4" />
                    Reset view
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/subjects">
                      <GitFork className="h-4 w-4" />
                      Subject Explorer
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={fitGraph}
                  disabled={graphActionsDisabled}
                >
                  <Maximize2 className="h-4 w-4" />
                  Fit graph
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetView}
                  disabled={graphActionsDisabled}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset view
                </Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard/subjects">
                    <GitFork className="h-4 w-4" />
                    Subject Explorer
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {!isMobile && (
            <div className="flex flex-wrap items-center gap-2">
              <MultiSelectFilter
                label="Streams"
                icon={Layers}
                options={streamOptions}
                selectedValues={selectedStreamNames}
                onSelectionChange={setSelectedStreamNames}
                emptyText="No streams"
              />
              <MultiSelectFilter
                label="Subjects"
                icon={GitFork}
                options={subjectOptions}
                selectedValues={selectedSubjectKeys}
                onSelectionChange={setSelectedSubjectKeys}
                emptyText="No subjects"
              />
              <MultiSelectFilter
                label="Consumers"
                icon={Users}
                options={consumerOptions}
                selectedValues={selectedConsumerIds}
                onSelectionChange={setSelectedConsumerIds}
                emptyText="No consumers"
              />
              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" onClick={clearSelectedFilters}>
                  <X className="h-4 w-4" />
                  Clear filters
                </Button>
              )}
              {toggleOptions.map((option) => (
                <ControlSwitch key={option.id} {...option} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="h-[720px] p-0">
          {hasTopologyData ? (
            <ReactFlow<TopologyFlowNode, TopologyEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={TOPOLOGY_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              onInit={setReactFlowInstance}
            >
              <Background />
              <Controls />
              {!isMobile && <MiniMap pannable zoomable />}
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
        <Badge
          variant="outline"
          className="gap-1 rounded-md border-primary/30 bg-primary/10 text-primary"
        >
          <Network className="h-3 w-3" />
          Cluster
        </Badge>
        <Badge variant="outline" className="gap-1 rounded-md">
          <Server className="h-3 w-3" />
          Server
        </Badge>
        <Badge
          variant="outline"
          className="gap-1 rounded-md border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
        >
          <Layers className="h-3 w-3" />
          Stream
        </Badge>
        <Badge
          variant="outline"
          className="gap-1 rounded-md border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
        >
          <GitFork className="h-3 w-3" />
          Subject
        </Badge>
        <Badge
          variant="outline"
          className="gap-1 rounded-md border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300"
        >
          <Users className="h-3 w-3" />
          Consumer
        </Badge>
        <Badge variant="warning" className="gap-1 rounded-md">
          <AlertTriangle className="h-3 w-3" />
          Lag or degraded replication
        </Badge>
      </div>
    </div>
  );
}
