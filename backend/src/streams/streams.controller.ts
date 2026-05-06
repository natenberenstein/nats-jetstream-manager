import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StreamsService, StreamInfoResponse } from './streams.service';
import { StreamCreateDto, StreamUpdateDto } from './dto/stream.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('Streams')
@Controller('connections/:connectionId/streams')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StreamsController {
  constructor(
    private readonly streamsService: StreamsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async listStreams(
    @Param('connectionId') connectionId: string,
  ): Promise<{ streams: StreamInfoResponse[]; total: number }> {
    return this.streamsService.listStreams(connectionId);
  }

  @Post()
  async createStream(
    @Param('connectionId') connectionId: string,
    @Body() dto: StreamCreateDto,
  ): Promise<StreamInfoResponse> {
    const stream = await this.streamsService.createStream(connectionId, dto);
    await this.auditService.log({
      action: 'stream.create',
      resourceType: 'stream',
      resourceName: stream.config.name,
      connectionId,
      details: { subjects: stream.config.subjects, storage: stream.config.storage },
    });
    return stream;
  }

  @Get(':name')
  async getStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
  ): Promise<StreamInfoResponse> {
    return this.streamsService.getStream(connectionId, name);
  }

  @Put(':name')
  async updateStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
    @Body() dto: StreamUpdateDto,
  ): Promise<StreamInfoResponse> {
    const stream = await this.streamsService.updateStream(connectionId, name, dto);
    await this.auditService.log({
      action: 'stream.update',
      resourceType: 'stream',
      resourceName: name,
      connectionId,
      details: { fields: Object.keys(dto) },
    });
    return stream;
  }

  @Delete(':name')
  async deleteStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
  ): Promise<{ success: boolean; deleted_stream: string }> {
    const result = await this.streamsService.deleteStream(connectionId, name);
    await this.auditService.log({
      action: 'stream.delete',
      resourceType: 'stream',
      resourceName: name,
      connectionId,
    });
    return result;
  }

  @Post(':name/purge')
  async purgeStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
  ): Promise<{ success: boolean; purged: boolean }> {
    const result = await this.streamsService.purgeStream(connectionId, name);
    await this.auditService.log({
      action: 'stream.purge',
      resourceType: 'stream',
      resourceName: name,
      connectionId,
    });
    return result;
  }
}
