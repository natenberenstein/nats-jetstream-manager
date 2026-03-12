import { Controller, Get, Param, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('connections/:connectionId/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('streams/:streamName')
  getStreamMetrics(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number,
  ) {
    return this.metricsService.getStreamRates(connectionId, streamName, window);
  }

  @Get('streams')
  getAllStreamMetrics(
    @Param('connectionId') connectionId: string,
    @Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number,
  ) {
    return this.metricsService.getAllStreamRates(connectionId, window);
  }
}
