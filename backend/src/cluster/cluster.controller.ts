import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClusterService, ClusterOverview } from './cluster.service';

@ApiTags('Cluster')
@Controller('connections/:connectionId/cluster')
export class ClusterController {
  constructor(private readonly clusterService: ClusterService) {}

  @Get('overview')
  async getOverview(@Param('connectionId') connectionId: string): Promise<ClusterOverview> {
    return this.clusterService.getOverview(connectionId);
  }
}
