import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConsumersService } from './consumers.service';
import { ConsumerCreateDto, ConsumerUpdateDto } from './dto/consumer.dto';

@ApiTags('Consumers')
@Controller('connections/:connectionId/streams/:streamName/consumers')
export class ConsumersController {
  constructor(private readonly consumersService: ConsumersService) {}

  @Get()
  listConsumers(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
  ) {
    return this.consumersService.listConsumers(connectionId, streamName);
  }

  @Get('analytics')
  getConsumerAnalytics(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
  ) {
    return this.consumersService.getConsumerAnalytics(connectionId, streamName);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Body() dto: ConsumerCreateDto,
  ) {
    return this.consumersService.createConsumer(connectionId, streamName, dto);
  }

  @Get(':name')
  getConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('name') name: string,
  ) {
    return this.consumersService.getConsumer(connectionId, streamName, name);
  }

  @Put(':name')
  @ApiOperation({ summary: 'Update a consumer' })
  async updateConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('name') name: string,
    @Body() dto: ConsumerUpdateDto,
  ) {
    return this.consumersService.updateConsumer(connectionId, streamName, name, dto);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.OK)
  deleteConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('name') name: string,
  ) {
    return this.consumersService.deleteConsumer(connectionId, streamName, name);
  }
}
