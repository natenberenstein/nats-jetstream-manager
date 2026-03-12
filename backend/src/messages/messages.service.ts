import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  JetStreamClient,
  JetStreamManager,
  StoredMsg,
  StringCodec,
  headers as natsHeaders,
  MsgHdrs,
} from 'nats';
import {
  MessagePublishRequestDto,
  MessagePublishResponseDto,
  MessagePublishBatchResponseDto,
  MessageDataDto,
  MessagesResponseDto,
  GetMessagesQueryDto,
  MessageReplayRequestDto,
  MessageReplayResponseDto,
  MessageIndexSearchResponseDto,
  IndexedMessageMatchDto,
  ValidateSchemaResponseDto,
  JsonSchemaDefinition,
  BuildIndexResponseDto,
} from './dto/message.dto';

// ─── Internal types ──────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sc = StringCodec();

/**
 * Convert a NATS subject pattern (with wildcards) to a RegExp.
 *   - `*`  matches exactly one token (between dots)
 *   - `>`  matches one or more tokens at the tail
 */
function natsSubjectToRegex(pattern: string): RegExp {
  const parts = pattern.split('.');
  const regexParts = parts.map((part, _idx) => {
    if (part === '>') {
      // `>` is only valid as the last token
      return '.+';
    }
    if (part === '*') {
      return '[^.]+';
    }
    // Escape regex-special characters in the literal token
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });

  return new RegExp(`^${regexParts.join('\\.')}$`);
}

function extractHeaders(hdrs: MsgHdrs | undefined): Record<string, string> | undefined {
  if (!hdrs) return undefined;
  const result: Record<string, string> = {};
  for (const key of hdrs.keys()) {
    result[key] = hdrs.get(key);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function decodePayload(data: Uint8Array): string {
  try {
    return new TextDecoder().decode(data);
  } catch {
    return '';
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  /**
   * In-memory search index keyed by "connectionId:streamName".
   */
  private readonly searchIndex = new Map<string, IndexEntry>();

  // ── Publish ──────────────────────────────────────────────────────────────

  async publishMessage(
    js: JetStreamClient,
    request: MessagePublishRequestDto,
  ): Promise<MessagePublishResponseDto> {
    const payload = typeof request.data === 'string' ? request.data : JSON.stringify(request.data);

    let h: MsgHdrs | undefined;
    if (request.headers && Object.keys(request.headers).length > 0) {
      h = natsHeaders();
      for (const [key, value] of Object.entries(request.headers)) {
        h.set(key, value);
      }
    }

    const pa = await js.publish(request.subject, sc.encode(payload), {
      headers: h,
    });

    return {
      stream: pa.stream,
      seq: pa.seq,
      duplicate: pa.duplicate,
    };
  }

  async publishBatch(
    js: JetStreamClient,
    messages: MessagePublishRequestDto[],
  ): Promise<MessagePublishBatchResponseDto> {
    const results: MessagePublishResponseDto[] = [];

    for (const msg of messages) {
      const result = await this.publishMessage(js, msg);
      results.push(result);
    }

    return {
      published: results.length,
      results,
    };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getMessages(
    jsm: JetStreamManager,
    streamName: string,
    query: GetMessagesQueryDto,
  ): Promise<MessagesResponseDto> {
    const {
      limit = 50,
      seq_start,
      seq_end,
      include_payload = true,
      preview_bytes,
      from_latest = false,
      filter_subject,
      header_key,
      header_value,
      payload_contains,
    } = query;

    // Get stream info to know the sequence range
    const streamInfo = await jsm.streams.info(streamName);
    const firstSeq = streamInfo.state.first_seq;
    const lastSeq = streamInfo.state.last_seq;
    const totalMessages = streamInfo.state.messages;

    if (totalMessages === 0) {
      return { messages: [], total: 0, has_more: false, next_seq: null };
    }

    // Determine the iteration range
    let startSeq: number;
    let endSeq: number;

    if (from_latest) {
      // Work backwards from the end
      endSeq = seq_end ?? lastSeq;
      startSeq = Math.max(firstSeq, endSeq - limit * 2 + 1); // over-fetch for filtering
    } else {
      startSeq = seq_start ?? firstSeq;
      endSeq = seq_end ?? lastSeq;
    }

    // Clamp to valid range
    startSeq = Math.max(startSeq, firstSeq);
    endSeq = Math.min(endSeq, lastSeq);

    // Build subject filter regex if needed
    let subjectRegex: RegExp | null = null;
    if (filter_subject) {
      subjectRegex = natsSubjectToRegex(filter_subject);
    }

    const messages: MessageDataDto[] = [];
    let nextSeq: number | null = null;

    if (from_latest) {
      // Iterate backwards
      for (let seq = endSeq; seq >= startSeq && messages.length < limit; seq--) {
        const msg = await this.fetchAndFilterMessage(
          jsm,
          streamName,
          seq,
          include_payload,
          preview_bytes,
          subjectRegex,
          header_key,
          header_value,
          payload_contains,
        );
        if (msg) {
          messages.push(msg);
        }
      }
      // Reverse so messages are in ascending order
      messages.reverse();
      nextSeq = startSeq > firstSeq ? startSeq - 1 : null;
    } else {
      // Iterate forwards
      for (let seq = startSeq; seq <= endSeq && messages.length < limit; seq++) {
        const msg = await this.fetchAndFilterMessage(
          jsm,
          streamName,
          seq,
          include_payload,
          preview_bytes,
          subjectRegex,
          header_key,
          header_value,
          payload_contains,
        );
        if (msg) {
          messages.push(msg);
        }
      }
      // Determine if there are more messages after our last fetched seq
      const lastFetchedSeq = messages.length > 0 ? messages[messages.length - 1].seq : endSeq;
      nextSeq = lastFetchedSeq < lastSeq ? lastFetchedSeq + 1 : null;
    }

    return {
      messages,
      total: totalMessages,
      has_more: nextSeq !== null,
      next_seq: nextSeq,
    };
  }

  async getMessage(
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
  ): Promise<MessageDataDto> {
    try {
      const sm = await jsm.streams.getMessage(streamName, { seq });
      return this.mapStoredMessage(sm, true);
    } catch {
      throw new NotFoundException(`Message with sequence ${seq} not found in stream ${streamName}`);
    }
  }

  // ── Replay ───────────────────────────────────────────────────────────────

  async replayMessage(
    js: JetStreamClient,
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    request: MessageReplayRequestDto,
  ): Promise<MessageReplayResponseDto> {
    // Fetch the original message
    let sm: StoredMsg;
    try {
      sm = await jsm.streams.getMessage(streamName, { seq });
    } catch {
      throw new NotFoundException(`Message with sequence ${seq} not found in stream ${streamName}`);
    }

    // Build headers for the replayed message
    let h: MsgHdrs | undefined;
    const shouldHaveHeaders =
      (request.copy_headers && sm.header) ||
      (request.extra_headers && Object.keys(request.extra_headers).length > 0);

    if (shouldHaveHeaders) {
      h = natsHeaders();

      // Copy original headers if requested
      if (request.copy_headers && sm.header) {
        for (const key of sm.header.keys()) {
          h.set(key, sm.header.get(key));
        }
      }

      // Apply extra headers (may overwrite copied ones)
      if (request.extra_headers) {
        for (const [key, value] of Object.entries(request.extra_headers)) {
          h.set(key, value);
        }
      }
    }

    // Publish to the target subject with the original payload
    const pa = await js.publish(request.target_subject, sm.data, {
      headers: h,
    });

    return {
      source_stream: streamName,
      source_seq: seq,
      target_subject: request.target_subject,
      published_stream: pa.stream,
      published_seq: pa.seq,
    };
  }

  // ── Search Index ─────────────────────────────────────────────────────────

  async buildSearchIndex(
    jsm: JetStreamManager,
    connectionId: string,
    streamName: string,
  ): Promise<BuildIndexResponseDto> {
    const streamInfo = await jsm.streams.info(streamName);
    const firstSeq = streamInfo.state.first_seq;
    const lastSeq = streamInfo.state.last_seq;
    const totalMessages = streamInfo.state.messages;

    if (totalMessages === 0) {
      const key = `${connectionId}:${streamName}`;
      this.searchIndex.set(key, { messages: [], built_at: new Date().toISOString() });
      return { stream_name: streamName, indexed_messages: 0 };
    }

    const indexed: IndexedMessage[] = [];

    for (let seq = firstSeq; seq <= lastSeq; seq++) {
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
        // Sequence may have been deleted — skip gaps
        continue;
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
            msg.payload.length > 200 ? msg.payload.slice(0, 200) + '...' : msg.payload,
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

  // ── Schema Validation ────────────────────────────────────────────────────

  validateSchema(data: unknown, schema: JsonSchemaDefinition): ValidateSchemaResponseDto {
    const errors: string[] = [];
    this.validateValue(data, schema, '', errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private async fetchAndFilterMessage(
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    includePayload: boolean,
    previewBytes: number | undefined,
    subjectRegex: RegExp | null,
    headerKey: string | undefined,
    headerValue: string | undefined,
    payloadContains: string | undefined,
  ): Promise<MessageDataDto | null> {
    let sm: StoredMsg;
    try {
      sm = await jsm.streams.getMessage(streamName, { seq });
    } catch {
      // Deleted or missing sequence — skip
      return null;
    }

    // Apply subject filter
    if (subjectRegex && !subjectRegex.test(sm.subject)) {
      return null;
    }

    // Apply header filter
    if (headerKey) {
      const hdrs = sm.header;
      if (!hdrs) return null;
      const val = hdrs.get(headerKey);
      if (!val) return null;
      if (headerValue && val !== headerValue) return null;
    }

    // Apply payload contains filter
    if (payloadContains) {
      const payload = decodePayload(sm.data);
      if (!payload.toLowerCase().includes(payloadContains.toLowerCase())) {
        return null;
      }
    }

    return this.mapStoredMessage(sm, includePayload, previewBytes);
  }

  private mapStoredMessage(
    sm: StoredMsg,
    includePayload: boolean,
    previewBytes?: number,
  ): MessageDataDto {
    const raw = decodePayload(sm.data);
    const payloadSize = sm.data ? sm.data.length : 0;
    const headers = extractHeaders(sm.header);
    const time = sm.time
      ? sm.time instanceof Date
        ? sm.time.toISOString()
        : String(sm.time)
      : null;

    const dto: MessageDataDto = {
      subject: sm.subject,
      seq: sm.seq,
      payload_size: payloadSize,
      headers,
      time,
    };

    if (includePayload) {
      if (previewBytes && raw.length > previewBytes) {
        dto.data_preview = raw.slice(0, previewBytes);
      } else {
        dto.data = tryParseJson(raw);
      }
    } else if (previewBytes) {
      dto.data_preview = raw.slice(0, previewBytes);
    }

    return dto;
  }

  private validateValue(
    value: unknown,
    schema: JsonSchemaDefinition,
    path: string,
    errors: string[],
  ): void {
    const fieldLabel = path || 'root';

    if (schema.enum) {
      if (!schema.enum.includes(value)) {
        errors.push(`${fieldLabel}: value must be one of [${schema.enum.join(', ')}]`);
      }
      return;
    }

    if (!schema.type) return;

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${fieldLabel}: expected string, got ${typeof value}`);
          return;
        }
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          errors.push(`${fieldLabel}: string length must be >= ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          errors.push(`${fieldLabel}: string length must be <= ${schema.maxLength}`);
        }
        break;

      case 'number':
      case 'integer':
        if (typeof value !== 'number') {
          errors.push(`${fieldLabel}: expected ${schema.type}, got ${typeof value}`);
          return;
        }
        if (schema.type === 'integer' && !Number.isInteger(value)) {
          errors.push(`${fieldLabel}: expected integer, got float`);
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          errors.push(`${fieldLabel}: value must be >= ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          errors.push(`${fieldLabel}: value must be <= ${schema.maximum}`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${fieldLabel}: expected boolean, got ${typeof value}`);
        }
        break;

      case 'null':
        if (value !== null) {
          errors.push(`${fieldLabel}: expected null`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${fieldLabel}: expected array, got ${typeof value}`);
          return;
        }
        if (schema.items) {
          value.forEach((item: unknown, idx: number) => {
            this.validateValue(item, schema.items!, `${path}[${idx}]`, errors);
          });
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push(`${fieldLabel}: expected object`);
          return;
        }
        {
          const obj = value as Record<string, unknown>;
          // Check required fields
          if (schema.required) {
            for (const field of schema.required) {
              if (!(field in obj)) {
                errors.push(`${path ? path + '.' : ''}${field}: required field is missing`);
              }
            }
          }
          // Validate known properties
          if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              if (propName in obj) {
                this.validateValue(
                  obj[propName],
                  propSchema,
                  path ? `${path}.${propName}` : propName,
                  errors,
                );
              }
            }
          }
        }
        break;

      default:
        errors.push(`${fieldLabel}: unsupported type "${schema.type}"`);
    }
  }
}
