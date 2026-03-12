import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { HealthHistoryService } from './health-history.service';

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
