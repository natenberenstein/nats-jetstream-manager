import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { ConnectionHealth } from '../database/entities/connection-health.entity';
import { ConnectionsService } from '../connections/connections.service';

export interface HealthCheckEntry {
  status: 'up' | 'down';
  jetstream_ok: boolean;
  error?: string;
  checked_at: string;
}

export interface HealthHistoryResponse {
  connection_id: string;
  checks: HealthCheckEntry[];
  window_hours: number;
}

export interface UptimeSummary {
  connection_id: string;
  total_checks: number;
  up_checks: number;
  down_checks: number;
  uptime_pct: number;
  last_status?: string;
  last_error?: string;
  last_checked_at?: string;
}

@Injectable()
export class HealthHistoryService {
  private readonly logger = new Logger(HealthHistoryService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(ConnectionHealth)
    private readonly healthRepo: Repository<ConnectionHealth>,
    private readonly configService: ConfigService,
    private readonly connectionsService: ConnectionsService,
  ) {
    this.retentionDays = parseInt(this.configService.get<string>('HEALTH_RETENTION_DAYS', '7'), 10);
  }

  @Interval(30_000)
  async checkAllConnections(): Promise<void> {
    const { connections } = this.connectionsService.listConnections();

    for (const connItem of connections) {
      try {
        const conn = this.connectionsService.getConnection(connItem.connection_id);
        let jetstreamOk = false;
        let status: 'up' | 'down' = 'down';
        let error: string | undefined;

        try {
          await conn.jsm.getAccountInfo();
          jetstreamOk = true;
          status = 'up';
        } catch (err: unknown) {
          error = (err as Error).message;
          // Connection exists but JetStream may be down
          status = conn.nc.isClosed() ? 'down' : 'up';
        }

        const record = this.healthRepo.create({
          connection_id: connItem.connection_id,
          url: connItem.url,
          status,
          jetstream_ok: jetstreamOk,
          error: error ?? undefined,
          checked_at: new Date(),
        });

        await this.healthRepo.save(record);
      } catch (err: unknown) {
        // Connection may have been removed between listing and checking
        const record = this.healthRepo.create({
          connection_id: connItem.connection_id,
          url: connItem.url,
          status: 'down',
          jetstream_ok: false,
          error: (err as Error).message,
          checked_at: new Date(),
        });

        await this.healthRepo.save(record);
      }
    }

    await this.pruneOldRecords();
  }

  async pruneOldRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.healthRepo
      .createQueryBuilder()
      .delete()
      .where('checked_at < :cutoff', { cutoff })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Pruned ${result.affected} old health records`);
    }
  }

  async getHealthHistory(
    connectionId: string,
    windowHours: number,
  ): Promise<HealthHistoryResponse> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const records = await this.healthRepo.find({
      where: {
        connection_id: connectionId,
        checked_at: MoreThan(since),
      },
      order: { checked_at: 'ASC' },
    });

    const checks: HealthCheckEntry[] = records.map((r) => ({
      status: r.status as 'up' | 'down',
      jetstream_ok: r.jetstream_ok,
      error: r.error ?? undefined,
      checked_at: new Date(r.checked_at).toISOString(),
    }));

    return {
      connection_id: connectionId,
      checks,
      window_hours: windowHours,
    };
  }

  async getUptimeSummary(connectionId: string, windowHours: number): Promise<UptimeSummary> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const records = await this.healthRepo.find({
      where: {
        connection_id: connectionId,
        checked_at: MoreThan(since),
      },
      order: { checked_at: 'ASC' },
    });

    const totalChecks = records.length;
    const upChecks = records.filter((r) => r.status === 'up').length;
    const downChecks = totalChecks - upChecks;
    const uptimePct = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 0;

    const lastRecord = records.length > 0 ? records[records.length - 1] : null;

    return {
      connection_id: connectionId,
      total_checks: totalChecks,
      up_checks: upChecks,
      down_checks: downChecks,
      uptime_pct: Math.round(uptimePct * 100) / 100,
      last_status: lastRecord?.status ?? undefined,
      last_error: lastRecord?.error ?? undefined,
      last_checked_at: lastRecord ? new Date(lastRecord.checked_at).toISOString() : undefined,
    };
  }
}
