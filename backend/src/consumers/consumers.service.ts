import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, ReplayPolicy, ConsumerInfo } from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import { StreamsService } from '../streams/streams.service';
import { ConsumerCreateDto } from './dto/consumer.dto';

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
}
