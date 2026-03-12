import { Controller, Get, Param } from '@nestjs/common';
import { ClusterService, ClusterOverview } from './cluster.service';

@Controller('connections/:connectionId/cluster')
export class ClusterController {
  constructor(private readonly clusterService: ClusterService) {}

  @Get('overview')
  async getOverview(
    @Param('connectionId') connectionId: string,
  ): Promise<ClusterOverview> {
    return this.clusterService.getOverview(connectionId);
  }
}
