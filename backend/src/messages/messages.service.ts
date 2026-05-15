import { Injectable, MessageEvent } from '@nestjs/common';
import { JetStreamClient, JetStreamManager, Msg, NatsConnection } from 'nats';
import { Observable } from 'rxjs';
import {
  BuildIndexResponseDto,
  GetMessagesQueryDto,
  JsonSchemaDefinition,
  LiveTailEventDto,
  LiveTailMessageDto,
  MessageDataDto,
  MessageDeleteRequestDto,
  MessageDeleteResponseDto,
  MessageIndexSearchResponseDto,
  MessagePublishBatchResponseDto,
  MessagePublishRequestDto,
  MessagePublishResponseDto,
  MessageRemediationActionRequestDto,
  MessageRemediationActionResponseDto,
  MessageRemediationFetchRequestDto,
  MessageRemediationFetchResponseDto,
  MessageReplayRequestDto,
  MessageReplayResponseDto,
  MessagesResponseDto,
  TailMessagesQueryDto,
  ValidateSchemaResponseDto,
} from './dto/message.dto';
import { MessagePublisherService } from './message-publisher.service';
import { MessageReaderService } from './message-reader.service';
import { MessageReplayService } from './message-replay.service';
import { MessageRemediationService } from './message-remediation.service';
import { BuildSearchIndexOptions, MessageIndexService } from './message-index.service';
import { MessageDeleteService } from './message-delete.service';
import { SchemaValidationService } from './schema-validation.service';
import { decodePayload, extractHeaders, tryParseJson } from './message-codec';

const LIVE_TAIL_HEARTBEAT_MS = 15_000;

@Injectable()
export class MessagesService {
  constructor(
    private readonly publisher: MessagePublisherService = new MessagePublisherService(),
    private readonly reader: MessageReaderService = new MessageReaderService(),
    private readonly replay: MessageReplayService = new MessageReplayService(),
    private readonly remediation: MessageRemediationService = new MessageRemediationService(),
    private readonly index: MessageIndexService = new MessageIndexService(),
    private readonly deletion: MessageDeleteService = new MessageDeleteService(),
    private readonly schemaValidation: SchemaValidationService = new SchemaValidationService(),
  ) {}

  publishMessage(
    js: JetStreamClient,
    request: MessagePublishRequestDto,
  ): Promise<MessagePublishResponseDto> {
    return this.publisher.publishMessage(js, request);
  }

  publishBatch(
    js: JetStreamClient,
    messages: MessagePublishRequestDto[],
  ): Promise<MessagePublishBatchResponseDto> {
    return this.publisher.publishBatch(js, messages);
  }

  getMessages(
    jsm: JetStreamManager,
    streamName: string,
    query: GetMessagesQueryDto,
  ): Promise<MessagesResponseDto> {
    return this.reader.getMessages(jsm, streamName, query);
  }

  getMessage(jsm: JetStreamManager, streamName: string, seq: number): Promise<MessageDataDto> {
    return this.reader.getMessage(jsm, streamName, seq);
  }

  replayMessage(
    js: JetStreamClient,
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    request: MessageReplayRequestDto,
  ): Promise<MessageReplayResponseDto> {
    return this.replay.replayMessage(js, jsm, streamName, seq, request);
  }

  fetchRemediationMessages(
    js: JetStreamClient,
    jsm: JetStreamManager,
    connectionId: string,
    streamName: string,
    consumerName: string,
    request: MessageRemediationFetchRequestDto,
  ): Promise<MessageRemediationFetchResponseDto> {
    return this.remediation.fetchRemediationMessages(
      js,
      jsm,
      connectionId,
      streamName,
      consumerName,
      request,
    );
  }

  applyRemediationAction(
    connectionId: string,
    streamName: string,
    consumerName: string,
    request: MessageRemediationActionRequestDto,
  ): Promise<MessageRemediationActionResponseDto> {
    return this.remediation.applyRemediationAction(connectionId, streamName, consumerName, request);
  }

  deleteStreamMessage(
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    request: MessageDeleteRequestDto,
  ): Promise<MessageDeleteResponseDto> {
    return this.deletion.deleteStreamMessage(jsm, streamName, seq, request);
  }

  buildSearchIndex(
    jsm: JetStreamManager,
    connectionId: string,
    streamName: string,
    limit: number = 2000,
    options: BuildSearchIndexOptions = {},
  ): Promise<BuildIndexResponseDto> {
    return this.index.buildSearchIndex(jsm, connectionId, streamName, limit, options);
  }

  searchIndexMessages(
    connectionId: string,
    streamName: string,
    queryStr: string,
    limit: number = 50,
  ): MessageIndexSearchResponseDto {
    return this.index.searchIndexMessages(connectionId, streamName, queryStr, limit);
  }

  validateSchema(data: unknown, schema: JsonSchemaDefinition): ValidateSchemaResponseDto {
    return this.schemaValidation.validateSchema(data, schema);
  }

  tailMessages(
    nc: NatsConnection,
    query: TailMessagesQueryDto,
    onActivity?: () => void,
  ): Observable<MessageEvent> {
    const { subject, include_payload = true, preview_bytes = 4096 } = query;

    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let received = 0;
      const subscription = nc.subscribe(subject);

      const emit = (event: LiveTailEventDto) => subscriber.next({ data: event });
      const now = () => new Date().toISOString();

      onActivity?.();
      emit({
        event_type: 'status',
        subject,
        received_at: now(),
        status: 'subscribed',
      });

      const heartbeat = setInterval(() => {
        onActivity?.();
        emit({
          event_type: 'heartbeat',
          subject,
          received_at: now(),
          status: 'active',
        });
      }, LIVE_TAIL_HEARTBEAT_MS);

      void (async () => {
        try {
          for await (const message of subscription) {
            received += 1;
            onActivity?.();
            emit({
              event_type: 'message',
              subject,
              received_at: now(),
              message: this.mapLiveTailMessage(message, received, include_payload, preview_bytes),
            });
          }

          if (!closed) {
            subscriber.complete();
          }
        } catch (error) {
          if (!closed) {
            subscriber.error(error);
          }
        }
      })();

      return () => {
        closed = true;
        clearInterval(heartbeat);
        subscription.unsubscribe();
      };
    });
  }

  private mapLiveTailMessage(
    message: Msg,
    id: number,
    includePayload: boolean,
    previewBytes: number,
  ): LiveTailMessageDto {
    const raw = decodePayload(message.data);
    const dto: LiveTailMessageDto = {
      id,
      subject: message.subject,
      payload_size: message.data.length,
      headers: extractHeaders(message.headers),
      received_at: new Date().toISOString(),
      reply: message.reply || undefined,
    };

    if (includePayload && raw.length <= previewBytes) {
      dto.data = tryParseJson(raw);
    } else {
      dto.data_preview = raw.slice(0, previewBytes);
    }

    return dto;
  }
}
