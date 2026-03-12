import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AdminGuard } from '../common/guards/admin.guard';

@ApiTags('Audit')
@ApiBearerAuth()
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
