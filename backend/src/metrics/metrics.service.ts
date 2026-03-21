import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { StreamMetric } from '../database/entities/stream-metric.entity';
import { ConsumerMetric } from '../database/entities/consumer-metric.entity';
import { ConnectionsService } from '../connections/connections.service';

export interface StreamMetricPoint {
  stream_name: string;
  collected_at: string;
  messages: number;
  bytes: number;
  consumer_count: number;
  msg_rate: number;
  byte_rate: number;
}

export interface StreamMetricsResponse {
  stream_name: string;
  points: StreamMetricPoint[];
  window_minutes: number;
}

export interface StreamMetricsSummaryResponse {
  connection_id: string;
  streams: StreamMetricsResponse[];
  window_minutes: number;
}

export interface ConsumerMetricPoint {
  consumer_name: string;
  stream_name: string;
  collected_at: string;
  num_pending: number;
  num_ack_pending: number;
  num_waiting: number;
  delivered_stream_seq: number;
  ack_floor_stream_seq: number;
}

export interface ConsumerMetricsResponse {
  stream_name: string;
  consumer_name: string;
  points: ConsumerMetricPoint[];
  window_minutes: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly retentionHours: number;

  constructor(
    @InjectRepository(StreamMetric)
    private readonly metricRepo: Repository<StreamMetric>,
    @InjectRepository(ConsumerMetric)
    private readonly consumerMetricRepo: Repository<ConsumerMetric>,
    private readonly configService: ConfigService,
    private readonly connectionsService: ConnectionsService,
  ) {
    this.retentionHours = parseInt(
      this.configService.get<string>('METRICS_RETENTION_HOURS', '24'),
      10,
    );
  }

  @Interval(30_000)
  async collectAllSnapshots(): Promise<void> {
    const { connections } = this.connectionsService.listConnections();

    for (const connItem of connections) {
      if (!connItem.connected) continue;

      try {
        const conn = this.connectionsService.getConnection(connItem.connection_id);
        const streams = await conn.jsm.streams.list().next();

        for (const stream of streams) {
          const metric = this.metricRepo.create({
            connection_id: connItem.connection_id,
            stream_name: stream.config.name,
            messages: stream.state.messages,
            bytes: stream.state.bytes,
            consumer_count: stream.state.consumer_count,
            collected_at: new Date(),
          });

          await this.metricRepo.save(metric);
        }
        // Collect consumer metrics for each stream
        for (const stream of streams) {
          try {
            const consumerLister = conn.jsm.consumers.list(stream.config.name);
            for await (const ci of consumerLister) {
              const consumerMetric = this.consumerMetricRepo.create({
                connection_id: connItem.connection_id,
                stream_name: stream.config.name,
                consumer_name: ci.name,
                num_pending: ci.num_pending,
                num_ack_pending: ci.num_ack_pending,
                num_waiting: ci.num_waiting,
                delivered_stream_seq: ci.delivered.stream_seq,
                ack_floor_stream_seq: ci.ack_floor.stream_seq,
                collected_at: new Date(),
              });
              await this.consumerMetricRepo.save(consumerMetric);
            }
          } catch {
            // Consumer list may fail for some streams, skip silently
          }
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to collect metrics for connection ${connItem.connection_id}: ${(error as Error).message}`,
        );
      }
    }

    await this.pruneOldMetrics();
  }

  async pruneOldMetrics(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000);

    const result = await this.metricRepo
      .createQueryBuilder()
      .delete()
      .where('collected_at < :cutoff', { cutoff })
      .execute();

    const consumerResult = await this.consumerMetricRepo
      .createQueryBuilder()
      .delete()
      .where('collected_at < :cutoff', { cutoff })
      .execute();

    const total = (result.affected ?? 0) + (consumerResult.affected ?? 0);
    if (total > 0) {
      this.logger.log(`Pruned ${total} old metric records`);
    }
  }

  async getStreamMetrics(
    connectionId: string,
    streamName: string,
    windowMinutes: number,
  ): Promise<StreamMetric[]> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    return this.metricRepo.find({
      where: {
        connection_id: connectionId,
        stream_name: streamName,
        collected_at: MoreThan(since),
      },
      order: { collected_at: 'ASC' },
    });
  }

  async getStreamRates(
    connectionId: string,
    streamName: string,
    windowMinutes: number,
  ): Promise<StreamMetricsResponse> {
    const metrics = await this.getStreamMetrics(connectionId, streamName, windowMinutes);
    const points = this.computeRates(metrics);

    return {
      stream_name: streamName,
      points,
      window_minutes: windowMinutes,
    };
  }

  async getAllStreamRates(
    connectionId: string,
    windowMinutes: number,
  ): Promise<StreamMetricsSummaryResponse> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const metrics = await this.metricRepo.find({
      where: {
        connection_id: connectionId,
        collected_at: MoreThan(since),
      },
      order: { collected_at: 'ASC' },
    });

    // Group by stream name
    const grouped = new Map<string, StreamMetric[]>();
    for (const m of metrics) {
      const existing = grouped.get(m.stream_name) ?? [];
      existing.push(m);
      grouped.set(m.stream_name, existing);
    }

    const streams: StreamMetricsResponse[] = [];
    for (const [streamName, streamMetrics] of grouped) {
      streams.push({
        stream_name: streamName,
        points: this.computeRates(streamMetrics),
        window_minutes: windowMinutes,
      });
    }

    return {
      connection_id: connectionId,
      streams,
      window_minutes: windowMinutes,
    };
  }

  async getConsumerMetrics(
    connectionId: string,
    streamName: string,
    consumerName: string,
    windowMinutes: number,
  ): Promise<ConsumerMetricsResponse> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const metrics = await this.consumerMetricRepo.find({
      where: {
        connection_id: connectionId,
        stream_name: streamName,
        consumer_name: consumerName,
        collected_at: MoreThan(since),
      },
      order: { collected_at: 'ASC' },
    });

    const points: ConsumerMetricPoint[] = metrics.map((m) => ({
      consumer_name: m.consumer_name,
      stream_name: m.stream_name,
      collected_at: new Date(m.collected_at).toISOString(),
      num_pending: m.num_pending,
      num_ack_pending: m.num_ack_pending,
      num_waiting: m.num_waiting,
      delivered_stream_seq: m.delivered_stream_seq,
      ack_floor_stream_seq: m.ack_floor_stream_seq,
    }));

    return {
      stream_name: streamName,
      consumer_name: consumerName,
      points,
      window_minutes: windowMinutes,
    };
  }

  async getAllConsumerMetrics(
    connectionId: string,
    streamName: string,
    windowMinutes: number,
  ): Promise<ConsumerMetricsResponse[]> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const metrics = await this.consumerMetricRepo.find({
      where: {
        connection_id: connectionId,
        stream_name: streamName,
        collected_at: MoreThan(since),
      },
      order: { collected_at: 'ASC' },
    });

    const grouped = new Map<string, ConsumerMetric[]>();
    for (const m of metrics) {
      const existing = grouped.get(m.consumer_name) ?? [];
      existing.push(m);
      grouped.set(m.consumer_name, existing);
    }

    const results: ConsumerMetricsResponse[] = [];
    for (const [consumerName, consumerMetrics] of grouped) {
      results.push({
        stream_name: streamName,
        consumer_name: consumerName,
        points: consumerMetrics.map((m) => ({
          consumer_name: m.consumer_name,
          stream_name: m.stream_name,
          collected_at: new Date(m.collected_at).toISOString(),
          num_pending: m.num_pending,
          num_ack_pending: m.num_ack_pending,
          num_waiting: m.num_waiting,
          delivered_stream_seq: m.delivered_stream_seq,
          ack_floor_stream_seq: m.ack_floor_stream_seq,
        })),
        window_minutes: windowMinutes,
      });
    }

    return results;
  }

  private computeRates(metrics: StreamMetric[]): StreamMetricPoint[] {
    const points: StreamMetricPoint[] = [];

    for (let i = 0; i < metrics.length; i++) {
      const current = metrics[i];
      let msgRate = 0;
      let byteRate = 0;

      if (i > 0) {
        const previous = metrics[i - 1];
        const timeDiffSeconds =
          (new Date(current.collected_at).getTime() - new Date(previous.collected_at).getTime()) /
          1000;

        if (timeDiffSeconds > 0) {
          msgRate = Math.max(0, (current.messages - previous.messages) / timeDiffSeconds);
          byteRate = Math.max(0, (current.bytes - previous.bytes) / timeDiffSeconds);
        }
      }

      points.push({
        stream_name: current.stream_name,
        collected_at: new Date(current.collected_at).toISOString(),
        messages: current.messages,
        bytes: current.bytes,
        consumer_count: current.consumer_count,
        msg_rate: Math.round(msgRate * 100) / 100,
        byte_rate: Math.round(byteRate * 100) / 100,
      });
    }

    return points;
  }
}
