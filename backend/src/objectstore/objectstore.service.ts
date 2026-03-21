import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageType, DiscardPolicy, ObjectStoreStatus, ObjectInfo } from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import { ObjectStoreCreateDto } from './dto/objectstore.dto';

const STORAGE_MAP: Record<string, StorageType> = {
  file: StorageType.File,
  memory: StorageType.Memory,
};

const STORAGE_REVERSE: Record<string, string> = {
  [String(StorageType.File)]: 'file',
  [String(StorageType.Memory)]: 'memory',
};

export interface ObjectStoreStatusResponse {
  bucket: string;
  description: string;
  storage: string;
  replicas: number;
  size: number;
  sealed: boolean;
  compression: boolean;
}

export interface ObjectInfoResponse {
  bucket: string;
  name: string;
  description?: string;
  size: number;
  chunks: number;
  digest: string;
  deleted: boolean;
  mtime: string;
  revision: number;
  nuid: string;
}

@Injectable()
export class ObjectStoreService {
  private readonly logger = new Logger(ObjectStoreService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  async listObjectStores(
    connectionId: string,
  ): Promise<{ object_stores: ObjectStoreStatusResponse[]; total: number }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);
    const stores: ObjectStoreStatusResponse[] = [];

    const lister = jsm.streams.listObjectStores();
    for await (const status of lister) {
      stores.push(this.convertObjectStoreStatus(status));
    }

    return { object_stores: stores, total: stores.length };
  }

  async getObjectStoreStatus(
    connectionId: string,
    bucket: string,
  ): Promise<ObjectStoreStatusResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const status = await os.status();
      return this.convertObjectStoreStatus(status);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async createObjectStore(
    connectionId: string,
    dto: ObjectStoreCreateDto,
  ): Promise<ObjectStoreStatusResponse> {
    const { js, jsm } = this.connectionsService.getConnection(connectionId);

    // The nats.js library has a bug where Object.assign(opts) leaks
    // non-stream fields (like `replicas`) into the stream config,
    // causing the server to reject them. Work around by creating the
    // backing stream directly, then opening the object store.
    const streamName = `OBJ_${dto.name}`;
    try {
      await jsm.streams.info(streamName);
    } catch (err: unknown) {
      if ((err as Error).message === 'stream not found') {
        await jsm.streams.add({
          name: streamName,
          subjects: [`$O.${dto.name}.C.>`, `$O.${dto.name}.M.>`],
          max_age: 0,
          storage: dto.storage ? STORAGE_MAP[dto.storage] : StorageType.File,
          num_replicas: dto.replicas ?? 1,
          max_bytes: dto.max_bytes ?? -1,
          discard: DiscardPolicy.New,
          allow_rollup_hdrs: true,
          allow_direct: true,
        });
      } else {
        throw err;
      }
    }

    const os = await js.views.os(dto.name);
    const status = await os.status();

    this.logger.log(`Object store '${dto.name}' created on connection ${connectionId}`);

    return this.convertObjectStoreStatus(status);
  }

  async deleteObjectStore(
    connectionId: string,
    bucket: string,
  ): Promise<{ success: boolean; deleted_bucket: string }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const result = await os.destroy();
      this.logger.log(`Object store '${bucket}' destroyed on connection ${connectionId}`);
      return { success: result, deleted_bucket: bucket };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async listObjects(
    connectionId: string,
    bucket: string,
  ): Promise<{ objects: ObjectInfoResponse[]; total: number }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const items = await os.list();
      const objects = items
        .filter((item) => !item.deleted)
        .map((item) => this.convertObjectInfo(item));
      return { objects, total: objects.length };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async getObjectInfo(
    connectionId: string,
    bucket: string,
    name: string,
  ): Promise<ObjectInfoResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const info = await os.info(name);
      if (!info || info.deleted) {
        throw new NotFoundException(`Object '${name}' not found in store '${bucket}'`);
      }
      return this.convertObjectInfo(info);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async getObjectData(
    connectionId: string,
    bucket: string,
    name: string,
  ): Promise<{ name: string; data: string }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const blob = await os.getBlob(name);
      if (!blob) {
        throw new NotFoundException(`Object '${name}' not found in store '${bucket}'`);
      }
      const data = Buffer.from(blob).toString('base64');
      return { name, data };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async putObject(
    connectionId: string,
    bucket: string,
    name: string,
    data: string,
    description?: string,
  ): Promise<ObjectInfoResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      const bytes = Buffer.from(data, 'base64');
      const meta: { name: string; description?: string } = { name };
      if (description) meta.description = description;
      const info = await os.putBlob(meta, bytes);
      this.logger.log(`Object '${name}' stored in '${bucket}' on connection ${connectionId}`);
      return this.convertObjectInfo(info);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  async deleteObject(
    connectionId: string,
    bucket: string,
    name: string,
  ): Promise<{ success: boolean }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const os = await js.views.os(bucket);
      await os.delete(name);
      this.logger.log(`Object '${name}' deleted from '${bucket}' on connection ${connectionId}`);
      return { success: true };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`Object store '${bucket}' not found`);
      }
      throw error;
    }
  }

  private convertObjectStoreStatus(status: ObjectStoreStatus): ObjectStoreStatusResponse {
    return {
      bucket: status.bucket,
      description: status.description || '',
      storage: STORAGE_REVERSE[status.storage] ?? 'file',
      replicas: status.replicas,
      size: status.size,
      sealed: status.sealed,
      compression: status.compression,
    };
  }

  private convertObjectInfo(info: ObjectInfo): ObjectInfoResponse {
    return {
      bucket: info.bucket,
      name: info.name,
      description: info.description,
      size: info.size,
      chunks: info.chunks,
      digest: info.digest,
      deleted: info.deleted,
      mtime: info.mtime,
      revision: info.revision,
      nuid: info.nuid,
    };
  }
}
