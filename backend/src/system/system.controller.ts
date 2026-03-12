import { Controller, Get, Param } from '@nestjs/common';
import { SystemService, SystemObservability } from './system.service';

@Controller('connections/:connectionId/system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('observability')
  async getObservability(
    @Param('connectionId') connectionId: string,
  ): Promise<SystemObservability> {
    return this.systemService.getObservability(connectionId);
  }
}
