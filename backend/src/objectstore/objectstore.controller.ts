import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ObjectStoreService,
  ObjectStoreStatusResponse,
  ObjectInfoResponse,
} from './objectstore.service';
import { ObjectStoreCreateDto, ObjectPutDto } from './dto/objectstore.dto';

@ApiTags('Object Stores')
@Controller('connections/:connectionId/objectstore')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ObjectStoreController {
  constructor(private readonly objectStoreService: ObjectStoreService) {}

  @Get()
  async listObjectStores(
    @Param('connectionId') connectionId: string,
  ): Promise<{ object_stores: ObjectStoreStatusResponse[]; total: number }> {
    return this.objectStoreService.listObjectStores(connectionId);
  }

  @Post()
  async createObjectStore(
    @Param('connectionId') connectionId: string,
    @Body() dto: ObjectStoreCreateDto,
  ): Promise<ObjectStoreStatusResponse> {
    return this.objectStoreService.createObjectStore(connectionId, dto);
  }

  @Get(':bucket')
  async getObjectStoreStatus(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<ObjectStoreStatusResponse> {
    return this.objectStoreService.getObjectStoreStatus(connectionId, bucket);
  }

  @Delete(':bucket')
  async deleteObjectStore(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<{ success: boolean; deleted_bucket: string }> {
    return this.objectStoreService.deleteObjectStore(connectionId, bucket);
  }

  @Get(':bucket/objects')
  async listObjects(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
  ): Promise<{ objects: ObjectInfoResponse[]; total: number }> {
    return this.objectStoreService.listObjects(connectionId, bucket);
  }

  @Get(':bucket/objects/:name/info')
  async getObjectInfo(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('name') name: string,
  ): Promise<ObjectInfoResponse> {
    return this.objectStoreService.getObjectInfo(connectionId, bucket, name);
  }

  @Get(':bucket/objects/:name/data')
  async getObjectData(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('name') name: string,
  ): Promise<{ name: string; data: string }> {
    return this.objectStoreService.getObjectData(connectionId, bucket, name);
  }

  @Post(':bucket/objects')
  async putObject(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Body() dto: ObjectPutDto,
  ): Promise<ObjectInfoResponse> {
    return this.objectStoreService.putObject(
      connectionId,
      bucket,
      dto.name,
      dto.data,
      dto.description,
    );
  }

  @Delete(':bucket/objects/:name')
  async deleteObject(
    @Param('connectionId') connectionId: string,
    @Param('bucket') bucket: string,
    @Param('name') name: string,
  ): Promise<{ success: boolean }> {
    return this.objectStoreService.deleteObject(connectionId, bucket, name);
  }
}
