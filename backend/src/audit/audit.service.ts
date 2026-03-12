import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuditLog } from '../database/entities/audit-log.entity';

export interface AuditLogParams {
  userId?: number;
  userEmail?: string;
  action: string;
  resourceType: string;
  resourceName?: string;
  connectionId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_name: string | null;
  connection_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditListResult {
  entries: AuditLogEntry[];
  total: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly configService: ConfigService,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      const entry = this.auditRepo.create({
        user_id: params.userId,
        user_email: params.userEmail,
        action: params.action,
        resource_type: params.resourceType,
        resource_name: params.resourceName,
        connection_id: params.connectionId,
        details_json: params.details ? JSON.stringify(params.details) : undefined,
        ip_address: params.ipAddress,
      });

      await this.auditRepo.save(entry);
    } catch (error: unknown) {
      this.logger.error(`Failed to write audit log: ${(error as Error).message}`);
    }
  }

  async listEntries(params: {
    limit?: number;
    offset?: number;
    action?: string;
    resourceType?: string;
    userId?: number;
  }): Promise<AuditListResult> {
    const { limit = 50, offset = 0, action, resourceType, userId } = params;

    const qb = this.auditRepo.createQueryBuilder('audit');

    if (action) {
      qb.andWhere('audit.action = :action', { action });
    }
    if (resourceType) {
      qb.andWhere('audit.resource_type = :resourceType', { resourceType });
    }
    if (userId !== undefined) {
      qb.andWhere('audit.user_id = :userId', { userId });
    }

    qb.orderBy('audit.created_at', 'DESC');
    qb.skip(offset).take(limit);

    const [records, total] = await qb.getManyAndCount();

    const entries: AuditLogEntry[] = records.map((r) => ({
      id: r.id,
      user_id: r.user_id ?? null,
      user_email: r.user_email ?? null,
      action: r.action,
      resource_type: r.resource_type,
      resource_name: r.resource_name ?? null,
      connection_id: r.connection_id ?? null,
      details: r.details_json ? JSON.parse(r.details_json) : null,
      ip_address: r.ip_address ?? null,
      created_at: new Date(r.created_at).toISOString(),
    }));

    return { entries, total };
  }
}
