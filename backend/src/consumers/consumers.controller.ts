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
import { AuditService } from '../audit/audit.service';

@ApiTags('Consumers')
@Controller('connections/:connectionId/streams/:streamName/consumers')
export class ConsumersController {
  constructor(
    private readonly consumersService: ConsumersService,
    private readonly auditService: AuditService,
  ) {}

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
  async createConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Body() dto: ConsumerCreateDto,
  ) {
    const consumer = await this.consumersService.createConsumer(connectionId, streamName, dto);
    await this.auditService.log({
      action: 'consumer.create',
      resourceType: 'consumer',
      resourceName: consumer.name,
      connectionId,
      details: {
        stream: streamName,
        durable: consumer.config?.durable_name,
        filter_subject: consumer.config?.filter_subject,
      },
    });
    return consumer;
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
    const consumer = await this.consumersService.updateConsumer(
      connectionId,
      streamName,
      name,
      dto,
    );
    await this.auditService.log({
      action: 'consumer.update',
      resourceType: 'consumer',
      resourceName: name,
      connectionId,
      details: { stream: streamName, fields: Object.keys(dto) },
    });
    return consumer;
  }

  @Delete(':name')
  @HttpCode(HttpStatus.OK)
  async deleteConsumer(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('name') name: string,
  ) {
    const result = await this.consumersService.deleteConsumer(connectionId, streamName, name);
    await this.auditService.log({
      action: 'consumer.delete',
      resourceType: 'consumer',
      resourceName: name,
      connectionId,
      details: { stream: streamName },
    });
    return result;
  }
}
