import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JetStreamClient, JetStreamManager, JsMsg } from 'nats';
import { randomUUID } from 'crypto';
import { isNatsNotFound } from '../common/nats/errors';
import {
  MessageRemediationAction,
  MessageRemediationActionRequestDto,
  MessageRemediationActionResponseDto,
  MessageRemediationActionResultDto,
  MessageRemediationFetchRequestDto,
  MessageRemediationFetchResponseDto,
  MessageRemediationMessageDto,
} from './dto/message.dto';
import { decodePayload, extractHeaders, tryParseJson } from './message-codec';

interface RemediationSession {
  id: string;
  connectionId: string;
  streamName: string;
  consumerName: string;
  messages: Map<number, JsMsg>;
  expiresAtMs: number;
  timer: ReturnType<typeof setTimeout>;
}

const REMEDIATION_SESSION_TTL_MS = 2 * 60 * 1000;
const MAX_REMEDIATION_BATCH_SIZE = 100;
const DEFAULT_REMEDIATION_FETCH_EXPIRES_MS = 1000;
const DEFAULT_REMEDIATION_ACK_TIMEOUT_MS = 2000;

@Injectable()
export class MessageRemediationService {
  private readonly remediationSessions = new Map<string, RemediationSession>();

  async fetchRemediationMessages(
    js: JetStreamClient,
    jsm: JetStreamManager,
    connectionId: string,
    streamName: string,
    consumerName: string,
    request: MessageRemediationFetchRequestDto,
  ): Promise<MessageRemediationFetchResponseDto> {
    const batchSize = Math.min(Math.max(request.batch_size ?? 25, 1), MAX_REMEDIATION_BATCH_SIZE);
    const expiresMs = request.expires_ms ?? DEFAULT_REMEDIATION_FETCH_EXPIRES_MS;
    const previewBytes = request.preview_bytes ?? 2048;

    let consumerInfo: Awaited<ReturnType<JetStreamManager['consumers']['info']>>;
    try {
      consumerInfo = await jsm.consumers.info(streamName, consumerName);
    } catch (error: unknown) {
      if (isNatsNotFound(error)) {
        throw new NotFoundException(
          `Consumer '${consumerName}' not found on stream '${streamName}'`,
        );
      }
      throw error;
    }

    if (consumerInfo.config?.deliver_subject) {
      throw new BadRequestException(
        `Consumer '${consumerName}' is a push consumer; remediation fetch requires a pull consumer`,
      );
    }

    const consumer = await js.consumers.get(streamName, consumerName).catch((error: unknown) => {
      if (isNatsNotFound(error)) {
        throw new NotFoundException(
          `Consumer '${consumerName}' not found on stream '${streamName}'`,
        );
      }
      throw error;
    });

    const delivered = await consumer.fetch({
      max_messages: batchSize,
      expires: expiresMs,
    });

    const messages: MessageRemediationMessageDto[] = [];
    const handles = new Map<number, JsMsg>();

    try {
      for await (const msg of delivered) {
        const streamSeq = msg.info.streamSequence;
        handles.set(streamSeq, msg);
        messages.push(this.mapRemediationMessage(msg, previewBytes));
        if (messages.length >= batchSize) break;
      }
    } finally {
      await delivered.close();
    }

    const session = this.createRemediationSession(connectionId, streamName, consumerName, handles);

    return {
      session_id: session.id,
      connection_id: connectionId,
      stream_name: streamName,
      consumer_name: consumerName,
      batch_size: batchSize,
      fetched: messages.length,
      expires_at: new Date(session.expiresAtMs).toISOString(),
      messages,
    };
  }

  async applyRemediationAction(
    connectionId: string,
    streamName: string,
    consumerName: string,
    request: MessageRemediationActionRequestDto,
  ): Promise<MessageRemediationActionResponseDto> {
    const session = this.getRemediationSession(
      request.session_id,
      connectionId,
      streamName,
      consumerName,
    );

    const results: MessageRemediationActionResultDto[] = [];

    for (const streamSeq of request.stream_sequences) {
      const msg = session.messages.get(streamSeq);
      if (!msg) {
        results.push({
          stream_seq: streamSeq,
          status: 'missing',
          error: 'Message is not available in the remediation session',
        });
        continue;
      }

      try {
        await this.applyActionToMessage(msg, request);
        if (request.action !== MessageRemediationAction.Working) {
          session.messages.delete(streamSeq);
        }
        results.push({
          stream_seq: streamSeq,
          consumer_seq: msg.info.deliverySequence,
          subject: msg.subject,
          status: 'ok',
        });
      } catch (error: unknown) {
        results.push({
          stream_seq: streamSeq,
          consumer_seq: msg.info.deliverySequence,
          subject: msg.subject,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const handled = results.filter((result) => result.status === 'ok').length;
    const failed = results.length - handled;

    if (session.messages.size === 0) {
      this.deleteRemediationSession(session.id);
    }

    return {
      session_id: session.id,
      stream_name: streamName,
      consumer_name: consumerName,
      action: request.action,
      handled,
      failed,
      remaining_session_messages: session.messages.size,
      expires_at: new Date(session.expiresAtMs).toISOString(),
      results,
    };
  }

  private mapRemediationMessage(msg: JsMsg, previewBytes: number): MessageRemediationMessageDto {
    const raw = decodePayload(msg.data);
    const payloadSize = msg.data ? msg.data.length : 0;
    const time =
      msg.info.timestampNanos > 0
        ? new Date(Math.floor(msg.info.timestampNanos / 1_000_000)).toISOString()
        : null;

    const dto: MessageRemediationMessageDto = {
      subject: msg.subject,
      seq: msg.info.streamSequence,
      consumer_seq: msg.info.deliverySequence,
      delivery_count: msg.info.deliveryCount,
      pending: msg.info.pending,
      redelivered: msg.info.redelivered,
      payload_size: payloadSize,
      headers: extractHeaders(msg.headers),
      time,
    };

    if (raw.length > previewBytes) {
      dto.data_preview = raw.slice(0, previewBytes);
    } else {
      dto.data = tryParseJson(raw);
    }

    return dto;
  }

  private async applyActionToMessage(
    msg: JsMsg,
    request: MessageRemediationActionRequestDto,
  ): Promise<void> {
    switch (request.action) {
      case MessageRemediationAction.Ack: {
        const confirmed = await msg.ackAck({ timeout: DEFAULT_REMEDIATION_ACK_TIMEOUT_MS });
        if (!confirmed) {
          throw new Error('JetStream did not confirm the acknowledgement');
        }
        return;
      }
      case MessageRemediationAction.Nak:
        msg.nak(request.nak_delay_ms);
        return;
      case MessageRemediationAction.Term:
        msg.term(request.term_reason);
        return;
      case MessageRemediationAction.Working:
        msg.working();
        return;
      default:
        throw new BadRequestException(`Unsupported remediation action: ${request.action}`);
    }
  }

  private createRemediationSession(
    connectionId: string,
    streamName: string,
    consumerName: string,
    messages: Map<number, JsMsg>,
  ): RemediationSession {
    const id = randomUUID();
    const expiresAtMs = Date.now() + REMEDIATION_SESSION_TTL_MS;
    const timer = setTimeout(() => {
      this.remediationSessions.delete(id);
    }, REMEDIATION_SESSION_TTL_MS);
    timer.unref?.();

    const session: RemediationSession = {
      id,
      connectionId,
      streamName,
      consumerName,
      messages,
      expiresAtMs,
      timer,
    };
    this.remediationSessions.set(id, session);
    return session;
  }

  private getRemediationSession(
    sessionId: string,
    connectionId: string,
    streamName: string,
    consumerName: string,
  ): RemediationSession {
    const session = this.remediationSessions.get(sessionId);
    if (!session || session.expiresAtMs <= Date.now()) {
      if (session) this.deleteRemediationSession(sessionId);
      throw new NotFoundException('Remediation session has expired or does not exist');
    }

    if (
      session.connectionId !== connectionId ||
      session.streamName !== streamName ||
      session.consumerName !== consumerName
    ) {
      throw new BadRequestException('Remediation session does not match the requested consumer');
    }

    return session;
  }

  private deleteRemediationSession(sessionId: string): void {
    const session = this.remediationSessions.get(sessionId);
    if (!session) return;
    clearTimeout(session.timer);
    this.remediationSessions.delete(sessionId);
  }
}
