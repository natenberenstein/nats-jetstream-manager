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
import { KvService, KvStatusResponse, KvEntryResponse } from './kv.service';
import { KvCreateDto, KvPutDto } from './dto/kv.dto';

@ApiTags('Key-Value Stores')
@Controller('connections/:connectionId/kv')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class KvController {
  constructor(private readonly kvService: KvService) {}

  @Get()
  async listKvStores(
    @Param('connectionId') connectionId: string,
  ): Promise<{ kv_stores: KvStatusResponse[]; total: number }> {
    return this.kvService.listKvStores(connectionId);
  }

  @Post()
  async createKvStore(
    @Param('connectionId') connectionId: string,
    @Body() dto: KvCreateDto,
  ): Promise<KvStatusResponse> {
    return this.kvService.createKvStore(connectionId, dto);
  }

  @Get(':bucket')
  async getKvStatus(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<KvStatusResponse> {
    return this.kvService.getKvStatus(connectionId, bucket);
  }

  @Delete(':bucket')
  async deleteKvStore(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<{ success: boolean; deleted_bucket: string }> {
    return this.kvService.deleteKvStore(connectionId, bucket);
  }

  @Get(':bucket/history')
  async watchHistory(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<{ entries: KvEntryResponse[]; total: number }> {
    return this.kvService.watchHistory(connectionId, bucket);
  }

  @Get(':bucket/keys')
  async listKeys(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<{ keys: string[]; total: number }> {
    return this.kvService.listKeys(connectionId, bucket);
  }

  @Get(':bucket/keys/:key')
  async getKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
  ): Promise<KvEntryResponse> {
    return this.kvService.getKey(connectionId, bucket, key);
  }

  @Put(':bucket/keys/:key')
  async putKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
    @Body() dto: KvPutDto,
  ): Promise<{ revision: number }> {
    return this.kvService.putKey(connectionId, bucket, key, dto.value);
  }

  @Delete(':bucket/keys/:key')
  async deleteKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
  ): Promise<{ success: boolean }> {
    return this.kvService.deleteKey(connectionId, bucket, key);
  }

  @Post(':bucket/keys/:key/purge')
  async purgeKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
  ): Promise<{ success: boolean }> {
    return this.kvService.purgeKey(connectionId, bucket, key);
  }
}
