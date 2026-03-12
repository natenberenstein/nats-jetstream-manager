import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HealthHistoryService } from './health-history.service';

@ApiTags('Health')
@ApiBearerAuth()
@Controller('connections/:connectionId/health')
export class HealthHistoryController {
  constructor(private readonly healthHistoryService: HealthHistoryService) {}

  @Get('history')
  getHealthHistory(
    @Param('connectionId') connectionId: string,
    @Query('window', new DefaultValuePipe(24), ParseIntPipe) window: number,
  ) {
    return this.healthHistoryService.getHealthHistory(connectionId, window);
  }

  @Get('uptime')
  getUptimeSummary(
    @Param('connectionId') connectionId: string,
    @Query('window', new DefaultValuePipe(24), ParseIntPipe) window: number,
  ) {
    return this.healthHistoryService.getUptimeSummary(connectionId, window);
  }
}
