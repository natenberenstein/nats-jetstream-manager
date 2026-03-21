import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageType, KvStatus, KvEntry } from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import { KvCreateDto } from './dto/kv.dto';

const NANOS_PER_MILLI = 1_000_000;

const STORAGE_MAP: Record<string, StorageType> = {
  file: StorageType.File,
  memory: StorageType.Memory,
};

const STORAGE_REVERSE: Record<string, string> = {
  [String(StorageType.File)]: 'file',
  [String(StorageType.Memory)]: 'memory',
};

export interface KvStatusResponse {
  bucket: string;
  description: string;
  storage: string;
  replicas: number;
  history: number;
  max_bytes: number;
  ttl: number;
  values: number;
  size: number;
}

export interface KvEntryResponse {
  bucket: string;
  key: string;
  value: string;
  revision: number;
  created: string;
  operation: 'PUT' | 'DEL' | 'PURGE';
  length: number;
}

@Injectable()
export class KvService {
  private readonly logger = new Logger(KvService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  async listKvStores(
    connectionId: string,
  ): Promise<{ kv_stores: KvStatusResponse[]; total: number }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);
    const kvStores: KvStatusResponse[] = [];

    const lister = jsm.streams.listKvs();
    for await (const status of lister) {
      kvStores.push(this.convertKvStatus(status));
    }

    return { kv_stores: kvStores, total: kvStores.length };
  }

  async getKvStatus(connectionId: string, bucket: string): Promise<KvStatusResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      const status = await kv.status();
      return this.convertKvStatus(status);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async createKvStore(connectionId: string, dto: KvCreateDto): Promise<KvStatusResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    const opts: Record<string, unknown> = {};
    if (dto.description !== undefined) opts.description = dto.description;
    if (dto.storage !== undefined) opts.storage = STORAGE_MAP[dto.storage];
    if (dto.history !== undefined) opts.history = dto.history;
    if (dto.max_bytes !== undefined) opts.max_bytes = dto.max_bytes;
    if (dto.ttl !== undefined) opts.ttl = dto.ttl * NANOS_PER_MILLI;
    if (dto.replicas !== undefined) opts.replicas = dto.replicas;
    if (dto.max_value_size !== undefined) opts.max_value_size = dto.max_value_size;

    const kv = await js.views.kv(dto.name, opts);
    const status = await kv.status();

    this.logger.log(`KV bucket '${dto.name}' created on connection ${connectionId}`);

    return this.convertKvStatus(status);
  }

  async deleteKvStore(
    connectionId: string,
    bucket: string,
  ): Promise<{ success: boolean; deleted_bucket: string }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      const result = await kv.destroy();
      this.logger.log(`KV bucket '${bucket}' destroyed on connection ${connectionId}`);
      return { success: result, deleted_bucket: bucket };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async listKeys(connectionId: string, bucket: string): Promise<{ keys: string[]; total: number }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      const keys: string[] = [];
      const iter = await kv.keys();
      for await (const key of iter) {
        keys.push(key);
      }
      return { keys, total: keys.length };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async getKey(connectionId: string, bucket: string, key: string): Promise<KvEntryResponse> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      const entry = await kv.get(key);
      if (!entry || entry.operation !== 'PUT') {
        throw new NotFoundException(`Key '${key}' not found in bucket '${bucket}'`);
      }
      return this.convertKvEntry(entry);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async putKey(
    connectionId: string,
    bucket: string,
    key: string,
    value: string,
  ): Promise<{ revision: number }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      const revision = await kv.put(key, value);
      this.logger.log(`Key '${key}' set in bucket '${bucket}' on connection ${connectionId}`);
      return { revision };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async deleteKey(
    connectionId: string,
    bucket: string,
    key: string,
  ): Promise<{ success: boolean }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      await kv.delete(key);
      this.logger.log(`Key '${key}' deleted from bucket '${bucket}' on connection ${connectionId}`);
      return { success: true };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  async purgeKey(connectionId: string, bucket: string, key: string): Promise<{ success: boolean }> {
    const { js } = this.connectionsService.getConnection(connectionId);

    try {
      const kv = await js.views.kv(bucket, { bindOnly: true });
      await kv.purge(key);
      this.logger.log(`Key '${key}' purged from bucket '${bucket}' on connection ${connectionId}`);
      return { success: true };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException(`KV bucket '${bucket}' not found`);
      }
      throw error;
    }
  }

  private convertKvStatus(status: KvStatus): KvStatusResponse {
    return {
      bucket: status.bucket,
      description: status.description || '',
      storage: STORAGE_REVERSE[status.streamInfo.config.storage] ?? 'file',
      replicas: status.replicas,
      history: status.history,
      max_bytes: status.max_bytes,
      ttl: status.ttl ? status.ttl / NANOS_PER_MILLI : 0,
      values: status.values,
      size: status.size,
    };
  }

  private convertKvEntry(entry: KvEntry): KvEntryResponse {
    return {
      bucket: entry.bucket,
      key: entry.key,
      value: entry.string(),
      revision: entry.revision,
      created: entry.created.toISOString(),
      operation: entry.operation,
      length: entry.length,
    };
  }
}
