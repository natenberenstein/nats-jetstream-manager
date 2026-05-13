import { Injectable } from '@nestjs/common';
import { JetStreamClient, JetStreamManager } from 'nats';
import {
  BuildIndexResponseDto,
  GetMessagesQueryDto,
  JsonSchemaDefinition,
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
  ValidateSchemaResponseDto,
} from './dto/message.dto';
import { MessagePublisherService } from './message-publisher.service';
import { MessageReaderService } from './message-reader.service';
import { MessageReplayService } from './message-replay.service';
import { MessageRemediationService } from './message-remediation.service';
import { BuildSearchIndexOptions, MessageIndexService } from './message-index.service';
import { MessageDeleteService } from './message-delete.service';
import { SchemaValidationService } from './schema-validation.service';

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
}
