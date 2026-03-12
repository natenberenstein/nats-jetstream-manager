import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @UseGuards(AdminGuard)
  listEntries(@Query() query: AuditQueryDto) {
    return this.auditService.listEntries({
      limit: query.limit,
      offset: query.offset,
      action: query.action,
      resourceType: query.resource_type,
      userId: query.user_id,
    });
  }
}
