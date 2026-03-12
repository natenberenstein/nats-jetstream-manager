import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConsumersService } from './consumers.service';
import { ConsumerCreateDto } from './dto/consumer.dto';
import { AdminGuard } from '../common/guards/admin.guard';

@ApiTags('Consumers')
@ApiBearerAuth()
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
  @UseGuards(AdminGuard)
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

  @Delete(':name')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  deleteConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('name') name: string,
  ) {
    return this.consumersService.deleteConsumer(connectionId, streamName, name);
  }
}
