import { Injectable, NotFoundException } from '@nestjs/common';
import { JetStreamManager, StoredMsg } from 'nats';
import { natsSubjectToRegex } from '../common/nats/subject';
import { GetMessagesQueryDto, MessageDataDto, MessagesResponseDto } from './dto/message.dto';
import {
  decodePayload,
  extractHeaders,
  parseOptionalTime,
  storedMessageTimeMs,
  tryParseJson,
} from './message-codec';

const DEFAULT_MESSAGE_SCAN_LIMIT = 2000;
const MAX_MESSAGE_SCAN_LIMIT = 10000;

@Injectable()
export class MessageReaderService {
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
      scan_limit,
      from_latest = false,
      filter_subject,
      header_key,
      header_value,
      payload_contains,
      from_time,
      to_time,
    } = query;
    const fromTimeMs = parseOptionalTime(from_time);
    const toTimeMs = parseOptionalTime(to_time);
    const scanLimit = Math.min(
      Math.max(scan_limit ?? Math.max(limit * 20, DEFAULT_MESSAGE_SCAN_LIMIT), limit),
      MAX_MESSAGE_SCAN_LIMIT,
    );

    const streamInfo = await jsm.streams.info(streamName);
    const firstSeq = streamInfo.state.first_seq;
    const lastSeq = streamInfo.state.last_seq;
    const totalMessages = streamInfo.state.messages;

    if (totalMessages === 0) {
      return {
        messages: [],
        total: 0,
        has_more: false,
        next_seq: null,
        scanned: 0,
        scan_limit: scanLimit,
      };
    }

    let startSeq = from_latest ? (seq_start ?? firstSeq) : (seq_start ?? firstSeq);
    let endSeq = from_latest ? (seq_end ?? lastSeq) : (seq_end ?? lastSeq);

    startSeq = Math.max(startSeq, firstSeq);
    endSeq = Math.min(endSeq, lastSeq);

    const subjectRegex = filter_subject ? natsSubjectToRegex(filter_subject) : null;
    const messages: MessageDataDto[] = [];
    let nextSeq: number | null = null;
    let scanned = 0;

    if (from_latest) {
      let cursor = endSeq;
      while (cursor >= startSeq && messages.length < limit && scanned < scanLimit) {
        const msg = await this.fetchAndFilterMessage(
          jsm,
          streamName,
          cursor,
          include_payload,
          preview_bytes,
          subjectRegex,
          header_key,
          header_value,
          payload_contains,
          fromTimeMs,
          toTimeMs,
        );
        if (msg) {
          messages.push(msg);
        }
        scanned += 1;
        cursor -= 1;
      }
      nextSeq = cursor >= startSeq ? cursor : null;
    } else {
      let cursor = startSeq;
      while (cursor <= endSeq && messages.length < limit && scanned < scanLimit) {
        const msg = await this.fetchAndFilterMessage(
          jsm,
          streamName,
          cursor,
          include_payload,
          preview_bytes,
          subjectRegex,
          header_key,
          header_value,
          payload_contains,
          fromTimeMs,
          toTimeMs,
        );
        if (msg) {
          messages.push(msg);
        }
        scanned += 1;
        cursor += 1;
      }
      nextSeq = cursor <= endSeq ? cursor : null;
    }

    return {
      messages,
      total: totalMessages,
      has_more: nextSeq !== null,
      next_seq: nextSeq,
      first_seq: firstSeq,
      last_seq: lastSeq,
      scanned,
      scan_limit: scanLimit,
      range_start: startSeq,
      range_end: endSeq,
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
    fromTimeMs: number | undefined,
    toTimeMs: number | undefined,
  ): Promise<MessageDataDto | null> {
    let sm: StoredMsg;
    try {
      sm = await jsm.streams.getMessage(streamName, { seq });
    } catch {
      return null;
    }

    if (subjectRegex && !subjectRegex.test(sm.subject)) {
      return null;
    }

    if (fromTimeMs !== undefined || toTimeMs !== undefined) {
      const messageTimeMs = storedMessageTimeMs(sm);
      if (messageTimeMs === undefined) return null;
      if (fromTimeMs !== undefined && messageTimeMs < fromTimeMs) return null;
      if (toTimeMs !== undefined && messageTimeMs > toTimeMs) return null;
    }

    if (headerKey) {
      const hdrs = sm.header;
      if (!hdrs) return null;
      const val = hdrs.get(headerKey);
      if (!val) return null;
      if (headerValue && val !== headerValue) return null;
    }

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
}
