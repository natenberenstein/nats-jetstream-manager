import { Injectable, Logger } from '@nestjs/common';
import { JetStreamManager } from 'nats';
import {
  BuildIndexResponseDto,
  IndexedMessageMatchDto,
  MessageIndexSearchResponseDto,
} from './dto/message.dto';
import { decodePayload, extractHeaders } from './message-codec';

interface IndexedMessage {
  seq: number;
  subject: string;
  payload: string;
  headers: Record<string, string>;
}

interface IndexEntry {
  messages: IndexedMessage[];
  built_at: string;
}

export class IndexBuildCancelledError extends Error {
  constructor(public readonly indexedMessages: number) {
    super('Index build was cancelled');
    this.name = 'IndexBuildCancelledError';
  }
}

export interface BuildSearchIndexOptions {
  onProgress?: (progress: { current: number; total: number; indexed: number }) => Promise<void>;
  shouldCancel?: () => Promise<boolean>;
}

const PROGRESS_UPDATE_INTERVAL = 50;

@Injectable()
export class MessageIndexService {
  private readonly logger = new Logger(MessageIndexService.name);
  private readonly searchIndex = new Map<string, IndexEntry>();

  async buildSearchIndex(
    jsm: JetStreamManager,
    connectionId: string,
    streamName: string,
    limit: number = 2000,
    options: BuildSearchIndexOptions = {},
  ): Promise<BuildIndexResponseDto> {
    const streamInfo = await jsm.streams.info(streamName);
    const firstSeq = streamInfo.state.first_seq;
    const lastSeq = streamInfo.state.last_seq;
    const totalMessages = streamInfo.state.messages;

    if (totalMessages === 0) {
      const key = `${connectionId}:${streamName}`;
      this.searchIndex.set(key, { messages: [], built_at: new Date().toISOString() });
      await options.onProgress?.({ current: 0, total: 0, indexed: 0 });
      return { stream_name: streamName, indexed_messages: 0 };
    }

    const indexed: IndexedMessage[] = [];
    const cappedLimit = Math.max(1, Math.floor(limit));
    const startSeq = Math.max(firstSeq, lastSeq - cappedLimit + 1);
    const totalToScan = lastSeq - startSeq + 1;
    let scanned = 0;

    for (let seq = startSeq; seq <= lastSeq; seq++) {
      scanned += 1;

      if (scanned === 1 || scanned % PROGRESS_UPDATE_INTERVAL === 0) {
        if (await options.shouldCancel?.()) {
          throw new IndexBuildCancelledError(indexed.length);
        }
      }

      try {
        const sm = await jsm.streams.getMessage(streamName, { seq });
        const payload = decodePayload(sm.data);
        const headers = extractHeaders(sm.header) ?? {};

        indexed.push({
          seq: sm.seq,
          subject: sm.subject,
          payload,
          headers,
        });
      } catch {
        continue;
      }

      if (scanned % PROGRESS_UPDATE_INTERVAL === 0 || seq === lastSeq) {
        await options.onProgress?.({
          current: scanned,
          total: totalToScan,
          indexed: indexed.length,
        });
      }
    }

    const key = `${connectionId}:${streamName}`;
    this.searchIndex.set(key, {
      messages: indexed,
      built_at: new Date().toISOString(),
    });

    this.logger.log(`Built search index for ${key}: ${indexed.length} messages`);

    return {
      stream_name: streamName,
      indexed_messages: indexed.length,
    };
  }

  searchIndexMessages(
    connectionId: string,
    streamName: string,
    queryStr: string,
    limit: number = 50,
  ): MessageIndexSearchResponseDto {
    const key = `${connectionId}:${streamName}`;
    const entry = this.searchIndex.get(key);

    if (!entry) {
      return {
        stream_name: streamName,
        query: queryStr,
        total: 0,
        indexed_messages: 0,
        matches: [],
      };
    }

    const lowerQuery = queryStr.toLowerCase();
    const matches: IndexedMessageMatchDto[] = [];

    for (const msg of entry.messages) {
      if (matches.length >= limit) break;

      const subjectMatch = msg.subject.toLowerCase().includes(lowerQuery);
      const payloadMatch = msg.payload.toLowerCase().includes(lowerQuery);

      if (subjectMatch || payloadMatch) {
        matches.push({
          seq: msg.seq,
          subject: msg.subject,
          payload_preview:
            msg.payload.length > 200 ? `${msg.payload.slice(0, 200)}...` : msg.payload,
          headers: Object.keys(msg.headers).length > 0 ? msg.headers : undefined,
        });
      }
    }

    return {
      stream_name: streamName,
      query: queryStr,
      total: matches.length,
      indexed_messages: entry.messages.length,
      matches,
      built_at: entry.built_at,
    };
  }
}
