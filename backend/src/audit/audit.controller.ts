import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('Audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
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
