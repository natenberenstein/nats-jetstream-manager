import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  StorageType,
  RetentionPolicy,
  DiscardPolicy,
  StreamInfo as NatsStreamInfo,
  StreamConfig as NatsStreamConfig,
} from 'nats';
import { ConnectionsService } from '../connections/connections.service';
import { StreamCreateDto, StreamUpdateDto } from './dto/stream.dto';

const NANOS_PER_SECOND = 1_000_000_000;

const STORAGE_MAP: Record<string, StorageType> = {
  file: StorageType.File,
  memory: StorageType.Memory,
};

const STORAGE_REVERSE: Record<string, string> = {
  [String(StorageType.File)]: 'file',
  [String(StorageType.Memory)]: 'memory',
};

const RETENTION_MAP: Record<string, RetentionPolicy> = {
  limits: RetentionPolicy.Limits,
  interest: RetentionPolicy.Interest,
  workqueue: RetentionPolicy.Workqueue,
};

const RETENTION_REVERSE: Record<string, string> = {
  [String(RetentionPolicy.Limits)]: 'limits',
  [String(RetentionPolicy.Interest)]: 'interest',
  [String(RetentionPolicy.Workqueue)]: 'workqueue',
};

const DISCARD_MAP: Record<string, DiscardPolicy> = {
  old: DiscardPolicy.Old,
  new: DiscardPolicy.New,
};

const DISCARD_REVERSE: Record<string, string> = {
  [String(DiscardPolicy.Old)]: 'old',
  [String(DiscardPolicy.New)]: 'new',
};

export interface StreamInfoResponse {
  config: {
    name: string;
    subjects: string[];
    storage?: string;
    retention?: string;
    max_consumers?: number;
    max_msgs?: number;
    max_bytes?: number;
    max_age?: number;
    max_msg_size?: number;
    discard?: string;
    duplicate_window?: number;
    replicas?: number;
    no_ack?: boolean;
    description?: string;
    mirror?: { name: string; filter_subject?: string } | null;
    sources?: Array<{ name: string; filter_subject?: string }>;
  };
  state: {
    messages: number;
    bytes: number;
    first_seq: number;
    last_seq: number;
    consumer_count: number;
    first_ts?: string;
    last_ts?: string;
  };
  created: string;
}

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  async listStreams(
    connectionId: string,
  ): Promise<{ streams: StreamInfoResponse[]; total: number }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);
    const streams: StreamInfoResponse[] = [];

    const lister = jsm.streams.list();
    for await (const si of lister) {
      streams.push(this.convertStreamInfo(si));
    }

    return { streams, total: streams.length };
  }

  async getStream(connectionId: string, name: string): Promise<StreamInfoResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    try {
      const si = await jsm.streams.info(name);
      return this.convertStreamInfo(si);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('stream not found')) {
        throw new NotFoundException(`Stream '${name}' not found`);
      }
      throw error;
    }
  }

  async createStream(connectionId: string, dto: StreamCreateDto): Promise<StreamInfoResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    const config = this.buildNatsConfig(dto);
    const si = await jsm.streams.add(config);

    this.logger.log(`Stream '${dto.name}' created on connection ${connectionId}`);

    return this.convertStreamInfo(si);
  }

  async updateStream(
    connectionId: string,
    name: string,
    dto: StreamUpdateDto,
  ): Promise<StreamInfoResponse> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    // Get the current config first so we can merge updates
    let currentInfo: NatsStreamInfo;
    try {
      currentInfo = await jsm.streams.info(name);
    } catch (error: unknown) {
      if ((error as Error).message?.includes('stream not found')) {
        throw new NotFoundException(`Stream '${name}' not found`);
      }
      throw error;
    }

    const updatedConfig: Partial<NatsStreamConfig> = {
      ...currentInfo.config,
      name,
    };

    if (dto.subjects !== undefined) {
      updatedConfig.subjects = dto.subjects;
    }
    if (dto.storage !== undefined) {
      updatedConfig.storage = STORAGE_MAP[dto.storage];
    }
    if (dto.retention !== undefined) {
      updatedConfig.retention = RETENTION_MAP[dto.retention];
    }
    if (dto.max_consumers !== undefined) {
      updatedConfig.max_consumers = dto.max_consumers;
    }
    if (dto.max_msgs !== undefined) {
      updatedConfig.max_msgs = dto.max_msgs;
    }
    if (dto.max_bytes !== undefined) {
      updatedConfig.max_bytes = dto.max_bytes;
    }
    if (dto.max_age !== undefined) {
      updatedConfig.max_age = dto.max_age * NANOS_PER_SECOND;
    }
    if (dto.max_msg_size !== undefined) {
      updatedConfig.max_msg_size = dto.max_msg_size;
    }
    if (dto.discard !== undefined) {
      updatedConfig.discard = DISCARD_MAP[dto.discard];
    }
    if (dto.duplicate_window !== undefined) {
      updatedConfig.duplicate_window = dto.duplicate_window * NANOS_PER_SECOND;
    }
    if (dto.replicas !== undefined) {
      updatedConfig.num_replicas = dto.replicas;
    }
    if (dto.no_ack !== undefined) {
      updatedConfig.no_ack = dto.no_ack;
    }
    if (dto.description !== undefined) {
      updatedConfig.description = dto.description;
    }

    const si = await jsm.streams.update(name, updatedConfig as NatsStreamConfig);

    this.logger.log(`Stream '${name}' updated on connection ${connectionId}`);

    return this.convertStreamInfo(si);
  }

  async deleteStream(
    connectionId: string,
    name: string,
  ): Promise<{ success: boolean; deleted_stream: string }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    try {
      const result = await jsm.streams.delete(name);
      this.logger.log(`Stream '${name}' deleted on connection ${connectionId}`);
      return { success: result, deleted_stream: name };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('stream not found')) {
        throw new NotFoundException(`Stream '${name}' not found`);
      }
      throw error;
    }
  }

  async purgeStream(
    connectionId: string,
    name: string,
  ): Promise<{ success: boolean; purged: boolean }> {
    const { jsm } = this.connectionsService.getConnection(connectionId);

    try {
      const info = await jsm.streams.purge(name);
      this.logger.log(
        `Stream '${name}' purged on connection ${connectionId}: ${info.purged} messages removed`,
      );
      return { success: info.success, purged: info.success };
    } catch (error: unknown) {
      if ((error as Error).message?.includes('stream not found')) {
        throw new NotFoundException(`Stream '${name}' not found`);
      }
      throw error;
    }
  }

  private convertStreamInfo(si: NatsStreamInfo): StreamInfoResponse {
    const config = si.config;
    const state = si.state;

    return {
      config: {
        name: config.name,
        subjects: config.subjects ?? [],
        storage: STORAGE_REVERSE[config.storage] ?? 'file',
        retention: RETENTION_REVERSE[config.retention] ?? 'limits',
        max_consumers: config.max_consumers,
        max_msgs: config.max_msgs,
        max_bytes: config.max_bytes,
        max_age: config.max_age ? config.max_age / NANOS_PER_SECOND : 0,
        max_msg_size: config.max_msg_size,
        discard: DISCARD_REVERSE[config.discard] ?? 'old',
        duplicate_window: config.duplicate_window ? config.duplicate_window / NANOS_PER_SECOND : 0,
        replicas: config.num_replicas,
        no_ack: config.no_ack,
        description: config.description,
        mirror: config.mirror
          ? { name: config.mirror.name, filter_subject: config.mirror.filter_subject }
          : null,
        sources:
          config.sources?.map((s) => ({ name: s.name, filter_subject: s.filter_subject })) ?? [],
      },
      state: {
        messages: state.messages,
        bytes: state.bytes,
        first_seq: state.first_seq,
        last_seq: state.last_seq,
        consumer_count: state.consumer_count,
        first_ts: state.first_ts || undefined,
        last_ts: state.last_ts || undefined,
      },
      created: String(si.created),
    };
  }

  private buildNatsConfig(dto: StreamCreateDto): Partial<NatsStreamConfig> {
    const config: Partial<NatsStreamConfig> = {
      name: dto.name,
      subjects: dto.subjects,
    };

    if (dto.storage !== undefined) {
      config.storage = STORAGE_MAP[dto.storage];
    }
    if (dto.retention !== undefined) {
      config.retention = RETENTION_MAP[dto.retention];
    }
    if (dto.max_consumers !== undefined) {
      config.max_consumers = dto.max_consumers;
    }
    if (dto.max_msgs !== undefined) {
      config.max_msgs = dto.max_msgs;
    }
    if (dto.max_bytes !== undefined) {
      config.max_bytes = dto.max_bytes;
    }
    if (dto.max_age !== undefined) {
      config.max_age = dto.max_age * NANOS_PER_SECOND;
    }
    if (dto.max_msg_size !== undefined) {
      config.max_msg_size = dto.max_msg_size;
    }
    if (dto.discard !== undefined) {
      config.discard = DISCARD_MAP[dto.discard];
    }
    if (dto.duplicate_window !== undefined) {
      config.duplicate_window = dto.duplicate_window * NANOS_PER_SECOND;
    }
    if (dto.replicas !== undefined) {
      config.num_replicas = dto.replicas;
    }
    if (dto.no_ack !== undefined) {
      config.no_ack = dto.no_ack;
    }
    if (dto.description !== undefined) {
      config.description = dto.description;
    }

    return config;
  }
}
