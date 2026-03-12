import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { StreamMetric } from '../database/entities/stream-metric.entity';
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

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly retentionHours: number;

  constructor(
    @InjectRepository(StreamMetric)
    private readonly metricRepo: Repository<StreamMetric>,
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

    if (result.affected && result.affected > 0) {
      this.logger.log(`Pruned ${result.affected} old metric records`);
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
