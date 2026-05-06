import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, ReplayPolicy, ConsumerInfo, StreamInfo } from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import { StreamsService } from '../streams/streams.service';
import { ConsumerCreateDto, ConsumerUpdateDto } from './dto/consumer.dto';

export interface ConsumerMetric {
  name: string;
  stream_name: string;
  num_pending: number;
  num_ack_pending: number;
  num_waiting: number;
  stream_lag: number;
  unacked_span: number;
  ack_wait_ns?: number;
}

export interface ConsumerResponse {
  stream_name: string;
  name: string;
  created: string;
  config: Record<string, unknown>;
  delivered: { consumer_seq: number; stream_seq: number };
  ack_floor: { consumer_seq: number; stream_seq: number };
  num_pending: number;
  num_waiting: number;
  num_ack_pending: number;
}

export interface ConsumerAnalytics {
  stream_name: string;
  total_consumers: number;
  total_pending: number;
  total_ack_pending: number;
  max_stream_lag: number;
  consumers: ConsumerMetric[];
  generated_at: string;
}

export type ConsumerIssueSeverity = 'critical' | 'warning' | 'info';
export type ConsumerHealthSeverity = ConsumerIssueSeverity | 'ok';

export interface ConsumerDiagnosticIssue {
  code: string;
  severity: ConsumerIssueSeverity;
  message: string;
  recommendation: string;
}

export interface ConsumerDiagnostic {
  stream_name: string;
  name: string;
  type: 'pull' | 'push';
  filter_subject?: string;
  deliver_policy: string;
  ack_policy: string;
  num_pending: number;
  num_ack_pending: number;
  num_waiting: number;
  stream_lag: number;
  unacked_span: number;
  delivered_stream_seq: number;
  ack_floor_stream_seq: number;
  last_stream_seq: number;
  ack_wait_ns?: number;
  max_ack_pending?: number;
  max_waiting?: number;
  max_deliver?: number;
  severity: ConsumerHealthSeverity;
  issues: ConsumerDiagnosticIssue[];
}

export interface ConsumerDiagnosticsResponse {
  connection_id: string;
  stream_name?: string;
  summary: {
    total: number;
    ok: number;
    info: number;
    warning: number;
    critical: number;
    total_pending: number;
    total_ack_pending: number;
    max_stream_lag: number;
  };
  consumers: ConsumerDiagnostic[];
  generated_at: string;
}

const DELIVER_POLICY_MAP: Record<string, DeliverPolicy> = {
  all: DeliverPolicy.All,
  last: DeliverPolicy.Last,
  new: DeliverPolicy.New,
  by_start_sequence: DeliverPolicy.StartSequence,
  by_start_time: DeliverPolicy.StartTime,
  last_per_subject: DeliverPolicy.LastPerSubject,
};

const DELIVER_POLICY_REVERSE: Record<string, string> = {
  [String(DeliverPolicy.All)]: 'all',
  [String(DeliverPolicy.Last)]: 'last',
  [String(DeliverPolicy.New)]: 'new',
  [String(DeliverPolicy.StartSequence)]: 'by_start_sequence',
  [String(DeliverPolicy.StartTime)]: 'by_start_time',
  [String(DeliverPolicy.LastPerSubject)]: 'last_per_subject',
};

const ACK_POLICY_MAP: Record<string, AckPolicy> = {
  all: AckPolicy.All,
  explicit: AckPolicy.Explicit,
  none: AckPolicy.None,
};

const ACK_POLICY_REVERSE: Record<string, string> = {
  [String(AckPolicy.All)]: 'all',
  [String(AckPolicy.Explicit)]: 'explicit',
  [String(AckPolicy.None)]: 'none',
};

const REPLAY_POLICY_MAP: Record<string, ReplayPolicy> = {
  instant: ReplayPolicy.Instant,
  original: ReplayPolicy.Original,
};

const REPLAY_POLICY_REVERSE: Record<string, string> = {
  [String(ReplayPolicy.Instant)]: 'instant',
  [String(ReplayPolicy.Original)]: 'original',
};

const LARGE_BACKLOG_THRESHOLD = 10_000;
const BACKLOG_WARNING_THRESHOLD = 1_000;
const ACK_PENDING_WARNING_THRESHOLD = 100;
const LIMIT_WARNING_RATIO = 0.8;

@Injectable()
export class ConsumersService {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly streamsService: StreamsService,
  ) {}

  async listConsumers(
    connectionId: string,
    streamName: string,
  ): Promise<{ consumers: ConsumerResponse[]; total: number }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    const consumers = await jsm.consumers.list(streamName).next();
    const converted = consumers.map((ci) => this.convertConsumerInfo(ci));

    return { consumers: converted, total: converted.length };
  }

  async getConsumer(
    connectionId: string,
    streamName: string,
    consumerName: string,
  ): Promise<ConsumerResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    try {
      const ci = await jsm.consumers.info(streamName, consumerName);
      return this.convertConsumerInfo(ci);
    } catch (error: unknown) {
      if (
        (error as Error).message?.includes('consumer not found') ||
        (error as Error).message?.includes('not found')
      ) {
        throw new NotFoundException(
          `Consumer '${consumerName}' not found on stream '${streamName}'`,
        );
      }
      throw error;
    }
  }

  async createConsumer(
    connectionId: string,
    streamName: string,
    dto: ConsumerCreateDto,
  ): Promise<ConsumerResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    const config: Record<string, unknown> = {};

    if (dto.durable_name) config.durable_name = dto.durable_name;
    if (dto.name) config.name = dto.name;
    if (dto.description) config.description = dto.description;
    if (dto.filter_subject) config.filter_subject = dto.filter_subject;
    if (dto.sample_freq) config.sample_freq = dto.sample_freq;
    if (dto.headers_only !== undefined) config.headers_only = dto.headers_only;

    if (dto.deliver_policy) {
      config.deliver_policy = DELIVER_POLICY_MAP[dto.deliver_policy];
      if (config.deliver_policy === undefined) {
        throw new BadRequestException(`Invalid deliver_policy: ${dto.deliver_policy}`);
      }
    }

    if (dto.ack_policy) {
      config.ack_policy = ACK_POLICY_MAP[dto.ack_policy];
      if (config.ack_policy === undefined) {
        throw new BadRequestException(`Invalid ack_policy: ${dto.ack_policy}`);
      }
    }

    if (dto.replay_policy) {
      config.replay_policy = REPLAY_POLICY_MAP[dto.replay_policy];
      if (config.replay_policy === undefined) {
        throw new BadRequestException(`Invalid replay_policy: ${dto.replay_policy}`);
      }
    }

    if (dto.deliver_subject) config.deliver_subject = dto.deliver_subject;
    if (dto.deliver_group) config.deliver_group = dto.deliver_group;
    if (dto.flow_control !== undefined) config.flow_control = dto.flow_control;
    if (dto.idle_heartbeat !== undefined) config.idle_heartbeat = dto.idle_heartbeat;

    if (dto.opt_start_seq !== undefined) config.opt_start_seq = dto.opt_start_seq;
    if (dto.opt_start_time !== undefined) config.opt_start_time = dto.opt_start_time;
    if (dto.ack_wait !== undefined) config.ack_wait = dto.ack_wait;
    if (dto.max_deliver !== undefined) config.max_deliver = dto.max_deliver;
    if (dto.rate_limit_bps !== undefined) config.rate_limit_bps = dto.rate_limit_bps;
    if (dto.max_ack_pending !== undefined) config.max_ack_pending = dto.max_ack_pending;
    if (dto.max_waiting !== undefined) config.max_waiting = dto.max_waiting;

    try {
      const ci = await jsm.consumers.add(streamName, config);
      this.logger.log(
        `Consumer created on stream '${streamName}': ${dto.durable_name || dto.name || 'ephemeral'}`,
      );
      return this.convertConsumerInfo(ci);
    } catch (error: unknown) {
      throw new BadRequestException(`Failed to create consumer: ${(error as Error).message}`);
    }
  }

  async updateConsumer(
    connectionId: string,
    streamName: string,
    consumerName: string,
    dto: ConsumerUpdateDto,
  ): Promise<ConsumerResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    // Get existing consumer info
    let currentInfo: ConsumerInfo;
    try {
      currentInfo = await jsm.consumers.info(streamName, consumerName);
    } catch (error: unknown) {
      if (
        (error as Error).message?.includes('consumer not found') ||
        (error as Error).message?.includes('not found')
      ) {
        throw new NotFoundException(
          `Consumer '${consumerName}' not found on stream '${streamName}'`,
        );
      }
      throw error;
    }

    // Merge existing config with updated fields
    const updatedConfig: Record<string, unknown> = {
      ...currentInfo.config,
    };

    if (dto.description !== undefined) updatedConfig.description = dto.description;
    if (dto.sample_freq !== undefined) updatedConfig.sample_freq = dto.sample_freq;
    if (dto.headers_only !== undefined) updatedConfig.headers_only = dto.headers_only;

    if (dto.ack_policy !== undefined) {
      const mapped = ACK_POLICY_MAP[dto.ack_policy];
      if (mapped === undefined) {
        throw new BadRequestException(`Invalid ack_policy: ${dto.ack_policy}`);
      }
      updatedConfig.ack_policy = mapped;
    }

    if (dto.ack_wait !== undefined) updatedConfig.ack_wait = dto.ack_wait;
    if (dto.max_deliver !== undefined) updatedConfig.max_deliver = dto.max_deliver;
    if (dto.rate_limit_bps !== undefined) updatedConfig.rate_limit_bps = dto.rate_limit_bps;
    if (dto.max_ack_pending !== undefined) updatedConfig.max_ack_pending = dto.max_ack_pending;
    if (dto.max_waiting !== undefined) updatedConfig.max_waiting = dto.max_waiting;

    try {
      const ci = await jsm.consumers.update(streamName, consumerName, updatedConfig);
      this.logger.log(`Consumer '${consumerName}' updated on stream '${streamName}'`);
      return this.convertConsumerInfo(ci);
    } catch (error: unknown) {
      throw new BadRequestException(`Failed to update consumer: ${(error as Error).message}`);
    }
  }

  async deleteConsumer(
    connectionId: string,
    streamName: string,
    consumerName: string,
  ): Promise<{ success: boolean; deleted_consumer: string }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    try {
      await jsm.consumers.delete(streamName, consumerName);
      this.logger.log(`Consumer '${consumerName}' deleted from stream '${streamName}'`);
      return { success: true, deleted_consumer: consumerName };
    } catch (error: unknown) {
      if (
        (error as Error).message?.includes('consumer not found') ||
        (error as Error).message?.includes('not found')
      ) {
        throw new NotFoundException(
          `Consumer '${consumerName}' not found on stream '${streamName}'`,
        );
      }
      throw new BadRequestException(`Failed to delete consumer: ${(error as Error).message}`);
    }
  }

  async getConsumerAnalytics(connectionId: string, streamName: string): Promise<ConsumerAnalytics> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    // Get stream info for last_seq
    const streamInfo = await jsm.streams.info(streamName);
    const lastSeq = streamInfo.state.last_seq;

    // List all consumers
    const consumers = await jsm.consumers.list(streamName).next();

    let totalPending = 0;
    let totalAckPending = 0;
    let maxStreamLag = 0;

    const consumerMetrics = consumers.map((ci) => {
      const deliveredStreamSeq = ci.delivered?.stream_seq ?? 0;
      const ackFloorStreamSeq = ci.ack_floor?.stream_seq ?? 0;
      const numPending = ci.num_pending ?? 0;
      const numAckPending = ci.num_ack_pending ?? 0;
      const numWaiting = ci.num_waiting ?? 0;

      const streamLag = lastSeq - deliveredStreamSeq;
      const unackedSpan = deliveredStreamSeq - ackFloorStreamSeq;

      totalPending += numPending;
      totalAckPending += numAckPending;
      if (streamLag > maxStreamLag) {
        maxStreamLag = streamLag;
      }

      const metric: ConsumerMetric = {
        name: ci.name || ci.config?.durable_name || '',
        stream_name: streamName,
        num_pending: numPending,
        num_ack_pending: numAckPending,
        num_waiting: numWaiting,
        stream_lag: streamLag,
        unacked_span: unackedSpan,
      };

      if (ci.config?.ack_wait !== undefined) {
        metric.ack_wait_ns = ci.config.ack_wait;
      }

      return metric;
    });

    return {
      stream_name: streamName,
      total_consumers: consumers.length,
      total_pending: totalPending,
      total_ack_pending: totalAckPending,
      max_stream_lag: maxStreamLag,
      consumers: consumerMetrics,
      generated_at: new Date().toISOString(),
    };
  }

  async getConsumerDiagnostics(
    connectionId: string,
    streamName?: string,
  ): Promise<ConsumerDiagnosticsResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    const streamInfos: StreamInfo[] = [];
    if (streamName) {
      streamInfos.push(await jsm.streams.info(streamName));
    } else {
      const streamLister = jsm.streams.list();
      for await (const stream of streamLister) {
        streamInfos.push(stream);
      }
    }

    const diagnostics: ConsumerDiagnostic[] = [];

    for (const stream of streamInfos) {
      const currentStreamName = stream.config.name;
      const lastStreamSeq = stream.state.last_seq ?? 0;
      const consumerLister = jsm.consumers.list(currentStreamName);

      for await (const ci of consumerLister) {
        diagnostics.push(this.buildConsumerDiagnostic(ci, currentStreamName, lastStreamSeq));
      }
    }

    const summary = diagnostics.reduce(
      (acc, diagnostic) => {
        acc.total += 1;
        if (diagnostic.severity === 'critical') acc.critical += 1;
        else if (diagnostic.severity === 'warning') acc.warning += 1;
        else if (diagnostic.severity === 'info') acc.info += 1;
        else acc.ok += 1;
        acc.total_pending += diagnostic.num_pending;
        acc.total_ack_pending += diagnostic.num_ack_pending;
        acc.max_stream_lag = Math.max(acc.max_stream_lag, diagnostic.stream_lag);
        return acc;
      },
      {
        total: 0,
        ok: 0,
        info: 0,
        warning: 0,
        critical: 0,
        total_pending: 0,
        total_ack_pending: 0,
        max_stream_lag: 0,
      },
    );

    return {
      connection_id: connectionId,
      stream_name: streamName,
      summary,
      consumers: diagnostics.sort((a, b) => {
        const severityDiff = this.severityRank(b.severity) - this.severityRank(a.severity);
        if (severityDiff !== 0) return severityDiff;
        return b.stream_lag - a.stream_lag;
      }),
      generated_at: new Date().toISOString(),
    };
  }

  private convertConsumerInfo(ci: ConsumerInfo): ConsumerResponse {
    const config = ci.config ?? {};

    return {
      stream_name: ci.stream_name ?? '',
      name: ci.name || config.durable_name || '',
      created: String(ci.created ?? ''),
      config: {
        name: config.name,
        durable_name: config.durable_name,
        description: config.description,
        deliver_policy: DELIVER_POLICY_REVERSE[config.deliver_policy] ?? 'all',
        opt_start_seq: config.opt_start_seq,
        opt_start_time: config.opt_start_time,
        ack_policy: ACK_POLICY_REVERSE[config.ack_policy] ?? 'explicit',
        ack_wait: config.ack_wait,
        max_deliver: config.max_deliver,
        filter_subject: config.filter_subject,
        deliver_subject: config.deliver_subject,
        deliver_group: config.deliver_group,
        flow_control: config.flow_control,
        idle_heartbeat: config.idle_heartbeat,
        replay_policy: REPLAY_POLICY_REVERSE[config.replay_policy] ?? 'instant',
        sample_freq: config.sample_freq,
        rate_limit_bps: config.rate_limit_bps,
        max_ack_pending: config.max_ack_pending,
        max_waiting: config.max_waiting,
        headers_only: config.headers_only,
      },
      delivered: {
        consumer_seq: ci.delivered?.consumer_seq ?? 0,
        stream_seq: ci.delivered?.stream_seq ?? 0,
      },
      ack_floor: {
        consumer_seq: ci.ack_floor?.consumer_seq ?? 0,
        stream_seq: ci.ack_floor?.stream_seq ?? 0,
      },
      num_pending: ci.num_pending ?? 0,
      num_waiting: ci.num_waiting ?? 0,
      num_ack_pending: ci.num_ack_pending ?? 0,
    };
  }

  private buildConsumerDiagnostic(
    ci: ConsumerInfo,
    streamName: string,
    lastStreamSeq: number,
  ): ConsumerDiagnostic {
    const config = ci.config ?? {};
    const name = ci.name || config.durable_name || '';
    const deliveredStreamSeq = ci.delivered?.stream_seq ?? 0;
    const ackFloorStreamSeq = ci.ack_floor?.stream_seq ?? 0;
    const numPending = ci.num_pending ?? 0;
    const numAckPending = ci.num_ack_pending ?? 0;
    const numWaiting = ci.num_waiting ?? 0;
    const streamLag = Math.max(0, lastStreamSeq - deliveredStreamSeq);
    const unackedSpan = Math.max(0, deliveredStreamSeq - ackFloorStreamSeq);
    const type = config.deliver_subject ? 'push' : 'pull';
    const ackPolicy = ACK_POLICY_REVERSE[config.ack_policy] ?? 'explicit';
    const deliverPolicy = DELIVER_POLICY_REVERSE[config.deliver_policy] ?? 'all';
    const maxAckPending = this.asNumber(config.max_ack_pending);
    const maxWaiting = this.asNumber(config.max_waiting);
    const maxDeliver = this.asNumber(config.max_deliver);
    const ackWaitNs = this.asNumber(config.ack_wait);

    const issues = this.buildDiagnosticIssues({
      type,
      ackPolicy,
      numPending,
      numAckPending,
      numWaiting,
      streamLag,
      unackedSpan,
      maxAckPending,
      maxWaiting,
      maxDeliver,
    });

    return {
      stream_name: streamName,
      name,
      type,
      filter_subject: typeof config.filter_subject === 'string' ? config.filter_subject : undefined,
      deliver_policy: deliverPolicy,
      ack_policy: ackPolicy,
      num_pending: numPending,
      num_ack_pending: numAckPending,
      num_waiting: numWaiting,
      stream_lag: streamLag,
      unacked_span: unackedSpan,
      delivered_stream_seq: deliveredStreamSeq,
      ack_floor_stream_seq: ackFloorStreamSeq,
      last_stream_seq: lastStreamSeq,
      ack_wait_ns: ackWaitNs,
      max_ack_pending: maxAckPending,
      max_waiting: maxWaiting,
      max_deliver: maxDeliver,
      severity: this.getDiagnosticSeverity(issues),
      issues,
    };
  }

  private buildDiagnosticIssues(params: {
    type: 'pull' | 'push';
    ackPolicy: string;
    numPending: number;
    numAckPending: number;
    numWaiting: number;
    streamLag: number;
    unackedSpan: number;
    maxAckPending?: number;
    maxWaiting?: number;
    maxDeliver?: number;
  }): ConsumerDiagnosticIssue[] {
    const issues: ConsumerDiagnosticIssue[] = [];
    const {
      type,
      ackPolicy,
      numPending,
      numAckPending,
      numWaiting,
      streamLag,
      unackedSpan,
      maxAckPending,
      maxWaiting,
      maxDeliver,
    } = params;

    if (numPending >= LARGE_BACKLOG_THRESHOLD || streamLag >= LARGE_BACKLOG_THRESHOLD) {
      issues.push({
        code: 'large_backlog',
        severity: 'critical',
        message: 'Consumer backlog is very large.',
        recommendation:
          'Scale workers, check subscriber health, or replay/redrive through a controlled path.',
      });
    } else if (numPending >= BACKLOG_WARNING_THRESHOLD || streamLag >= BACKLOG_WARNING_THRESHOLD) {
      issues.push({
        code: 'backlog_growth',
        severity: 'warning',
        message: 'Consumer is materially behind the stream.',
        recommendation:
          'Check processing rate, delivery limits, and whether subscribers are connected.',
      });
    } else if (streamLag > 0 || numPending > 0) {
      issues.push({
        code: 'minor_lag',
        severity: 'info',
        message: 'Consumer has pending messages or sequence lag.',
        recommendation: 'Watch the trend and confirm the consumer is draining normally.',
      });
    }

    if (type === 'pull' && numPending > 0 && numWaiting === 0) {
      issues.push({
        code: 'no_pull_waiters',
        severity: numPending >= BACKLOG_WARNING_THRESHOLD ? 'warning' : 'info',
        message: 'Pull consumer has pending messages but no waiting pull requests.',
        recommendation: 'Confirm workers are issuing fetch requests and have not stopped polling.',
      });
    }

    if (type === 'push' && numPending > 0) {
      issues.push({
        code: 'push_delivery_backlog',
        severity: numPending >= BACKLOG_WARNING_THRESHOLD ? 'warning' : 'info',
        message: 'Push consumer has queued messages waiting for delivery.',
        recommendation:
          'Check subscribers on the delivery subject and delivery-group queue membership.',
      });
    }

    if (ackPolicy !== 'none' && numAckPending > 0) {
      issues.push({
        code: 'ack_pending',
        severity: numAckPending >= ACK_PENDING_WARNING_THRESHOLD ? 'warning' : 'info',
        message: 'Consumer has delivered messages waiting for acknowledgements.',
        recommendation: 'Check handler latency, ack failures, and ack wait versus processing time.',
      });
    }

    if (maxAckPending !== undefined && maxAckPending > 0 && numAckPending >= maxAckPending) {
      issues.push({
        code: 'max_ack_pending_reached',
        severity: 'critical',
        message: 'Consumer reached max_ack_pending and delivery may be blocked.',
        recommendation:
          'Ack or terminate in-flight messages, increase max_ack_pending, or scale workers.',
      });
    } else if (
      maxAckPending !== undefined &&
      maxAckPending > 0 &&
      numAckPending >= maxAckPending * LIMIT_WARNING_RATIO
    ) {
      issues.push({
        code: 'max_ack_pending_near_limit',
        severity: 'warning',
        message: 'Consumer is close to max_ack_pending.',
        recommendation:
          'Increase processing capacity or raise the limit after checking subscriber behavior.',
      });
    }

    if (
      type === 'pull' &&
      maxWaiting !== undefined &&
      maxWaiting > 0 &&
      numWaiting >= maxWaiting * LIMIT_WARNING_RATIO
    ) {
      issues.push({
        code: 'max_waiting_near_limit',
        severity: 'warning',
        message: 'Pull requests are close to max_waiting.',
        recommendation: 'Reduce concurrent fetches or raise max_waiting for this consumer.',
      });
    }

    if (unackedSpan > Math.max(ACK_PENDING_WARNING_THRESHOLD, numAckPending * 3)) {
      issues.push({
        code: 'wide_unacked_span',
        severity: 'warning',
        message: 'Ack floor is far behind the delivered sequence.',
        recommendation:
          'Look for old in-flight messages, long processing retries, or stuck worker instances.',
      });
    }

    if (maxDeliver === 1 && ackPolicy !== 'none' && numAckPending > 0) {
      issues.push({
        code: 'single_delivery_risk',
        severity: 'info',
        message: 'Consumer is configured for a single delivery attempt.',
        recommendation:
          'Verify failures are handled outside JetStream or increase max_deliver for retries.',
      });
    }

    return this.dedupeIssues(issues);
  }

  private getDiagnosticSeverity(issues: ConsumerDiagnosticIssue[]): ConsumerHealthSeverity {
    if (issues.some((issue) => issue.severity === 'critical')) return 'critical';
    if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
    if (issues.some((issue) => issue.severity === 'info')) return 'info';
    return 'ok';
  }

  private severityRank(severity: ConsumerHealthSeverity): number {
    if (severity === 'critical') return 3;
    if (severity === 'warning') return 2;
    if (severity === 'info') return 1;
    return 0;
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private dedupeIssues(issues: ConsumerDiagnosticIssue[]): ConsumerDiagnosticIssue[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      if (seen.has(issue.code)) return false;
      seen.add(issue.code);
      return true;
    });
  }
}
