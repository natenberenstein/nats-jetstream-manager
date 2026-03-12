import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { IndexBuildJobDto } from './dto/job.dto';
import { AdminGuard } from '../common/guards/admin.guard';
import { ConnectionsService, ConnectionInfo } from '../connections/connections.service';
import { MessagesService } from '../messages/messages.service';

@Controller('connections/:connectionId/jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly connectionsService: ConnectionsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  @Get()
  async listJobs(
    @Param('connectionId') connectionId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.jobsService.listJobs(connectionId, limit);
  }

  @Get(':jobId')
  async getJob(@Param('connectionId') connectionId: string, @Param('jobId') jobId: string) {
    const job = await this.jobsService.getJob(connectionId, jobId);
    return this.jobsService.convertJobToResponse(job);
  }

  @Post('index-build')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async submitIndexBuildJob(
    @Param('connectionId') connectionId: string,
    @Body() dto: IndexBuildJobDto,
  ) {
    const conn = this.connectionsService.getConnection(connectionId);

    const job = await this.jobsService.createJob(connectionId, 'index_build', {
      stream_name: dto.stream_name,
      limit: dto.limit,
    });

    // Run index build in background
    this.runIndexBuild(connectionId, job.id, conn, dto.stream_name, dto.limit).catch((err) => {
      this.jobsService
        .updateJob(job.id, {
          status: 'failed',
          error: err.message,
          completed_at: new Date(),
        })
        .catch(() => {});
    });

    return this.jobsService.convertJobToResponse(job);
  }

  @Post(':jobId/cancel')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async cancelJob(@Param('connectionId') connectionId: string, @Param('jobId') jobId: string) {
    return this.jobsService.cancelJob(connectionId, jobId);
  }

  private async runIndexBuild(
    connectionId: string,
    jobId: string,
    conn: ConnectionInfo,
    streamName: string,
    _limit?: number,
  ): Promise<void> {
    await this.jobsService.updateJob(jobId, {
      status: 'running',
      started_at: new Date(),
      message: `Building search index for stream ${streamName}`,
    });

    try {
      const result = await this.messagesService.buildSearchIndex(
        conn.jsm,
        connectionId,
        streamName,
      );

      // Check if cancellation was requested
      const currentJob = await this.jobsService.getJob(connectionId, jobId);
      if (currentJob.cancel_requested) {
        await this.jobsService.updateJob(jobId, {
          status: 'cancelled',
          completed_at: new Date(),
          message: 'Job was cancelled',
        });
        return;
      }

      await this.jobsService.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date(),
        message: 'Index build completed',
        result_json: JSON.stringify(result ?? {}),
      });
    } catch (error: unknown) {
      await this.jobsService.updateJob(jobId, {
        status: 'failed',
        error: (error as Error).message,
        completed_at: new Date(),
      });
    }
  }
}
