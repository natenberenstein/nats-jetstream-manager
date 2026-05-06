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
import { AuditService } from '../audit/audit.service';

@ApiTags('Key-Value Stores')
@Controller('connections/:connectionId/kv')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class KvController {
  constructor(
    private readonly kvService: KvService,
    private readonly auditService: AuditService,
  ) {}

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
    const store = await this.kvService.createKvStore(connectionId, dto);
    await this.auditService.log({
      action: 'kv.create',
      resourceType: 'kv',
      resourceName: store.bucket,
      connectionId,
      details: { storage: store.storage, replicas: store.replicas, history: store.history },
    });
    return store;
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
    const result = await this.kvService.deleteKvStore(connectionId, bucket);
    await this.auditService.log({
      action: 'kv.delete',
      resourceType: 'kv',
      resourceName: bucket,
      connectionId,
    });
    return result;
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
    const result = await this.kvService.putKey(connectionId, bucket, key, dto.value);
    await this.auditService.log({
      action: 'kv.key.put',
      resourceType: 'kv_key',
      resourceName: key,
      connectionId,
      details: { bucket, revision: result.revision, bytes: dto.value.length },
    });
    return result;
  }

  @Delete(':bucket/keys/:key')
  async deleteKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
  ): Promise<{ success: boolean }> {
    const result = await this.kvService.deleteKey(connectionId, bucket, key);
    await this.auditService.log({
      action: 'kv.key.delete',
      resourceType: 'kv_key',
      resourceName: key,
      connectionId,
      details: { bucket },
    });
    return result;
  }

  @Post(':bucket/keys/:key/purge')
  async purgeKey(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('key') key: string,
  ): Promise<{ success: boolean }> {
    const result = await this.kvService.purgeKey(connectionId, bucket, key);
    await this.auditService.log({
      action: 'kv.key.purge',
      resourceType: 'kv_key',
      resourceName: key,
      connectionId,
      details: { bucket },
    });
    return result;
  }
}
