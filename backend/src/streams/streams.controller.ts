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

@ApiTags('Streams')
@Controller('connections/:connectionId/streams')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

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
    return this.streamsService.createStream(connectionId, dto);
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
    return this.streamsService.updateStream(connectionId, name, dto);
  }

  @Delete(':name')
  async deleteStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
  ): Promise<{ success: boolean; deleted_stream: string }> {
    return this.streamsService.deleteStream(connectionId, name);
  }

  @Post(':name/purge')
  async purgeStream(
    @Param('connectionId') connectionId: string,
    @Param('name') name: string,
  ): Promise<{ success: boolean; purged: boolean }> {
    return this.streamsService.purgeStream(connectionId, name);
  }
}
