import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessagesService } from './messages.service';
import {
  MessagePublishRequestDto,
  MessagePublishBatchRequestDto,
  MessageReplayRequestDto,
  MessageRemediationActionRequestDto,
  MessageRemediationActionResponseDto,
  MessageRemediationFetchRequestDto,
  MessageRemediationFetchResponseDto,
  MessageDeleteRequestDto,
  MessageDeleteResponseDto,
  ValidateSchemaRequestDto,
  BuildIndexRequestDto,
  GetMessagesQueryDto,
  SearchIndexQueryDto,
  MessagePublishResponseDto,
  MessagePublishBatchResponseDto,
  MessageDataDto,
  MessagesResponseDto,
  MessageReplayResponseDto,
  MessageIndexSearchResponseDto,
  ValidateSchemaResponseDto,
  BuildIndexResponseDto,
  TailMessagesQueryDto,
} from './dto/message.dto';
import { ConnectionsService } from '../connections/connections.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('Messages')
@Controller('connections/:connectionId')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly connectionsService: ConnectionsService,
    private readonly auditService: AuditService,
  ) {}

  @Post('messages/publish')
  @HttpCode(HttpStatus.OK)
  async publishMessage(
    @Param('connectionId') connectionId: string,
    @Body() body: MessagePublishRequestDto,
  ): Promise<MessagePublishResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.publishMessage(conn.js, body);
    await this.auditService.log({
      action: 'message.publish',
      resourceType: 'message',
      resourceName: body.subject,
      connectionId,
      details: { stream: result.stream, seq: result.seq, duplicate: result.duplicate },
    });
    return result;
  }

  @Post('messages/publish-batch')
  @HttpCode(HttpStatus.OK)
  async publishBatch(
    @Param('connectionId') connectionId: string,
    @Body() body: MessagePublishBatchRequestDto,
  ): Promise<MessagePublishBatchResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.publishBatch(conn.js, body.messages);
    await this.auditService.log({
      action: 'message.publish_batch',
      resourceType: 'message',
      connectionId,
      details: {
        published: result.published,
        subjects: Array.from(new Set(body.messages.map((message) => message.subject))),
      },
    });
    return result;
  }

  @Post('messages/validate-schema')
  @HttpCode(HttpStatus.OK)
  async validateSchema(@Body() body: ValidateSchemaRequestDto): Promise<ValidateSchemaResponseDto> {
    return this.messagesService.validateSchema(body.data, body.schema);
  }

  @Sse('messages/tail')
  tailMessages(
    @Param('connectionId') connectionId: string,
    @Query() query: TailMessagesQueryDto,
  ): Observable<MessageEvent> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.tailMessages(conn.nc, query, () =>
      this.connectionsService.touchConnection(connectionId),
    );
  }

  @Get('streams/:streamName/messages')
  async getMessages(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<MessagesResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.getMessages(conn.jsm, streamName, query);
  }

  @Get('streams/:streamName/messages/index/search')
  async searchIndex(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Query() query: SearchIndexQueryDto,
  ): Promise<MessageIndexSearchResponseDto> {
    return this.messagesService.searchIndexMessages(
      connectionId,
      streamName,
      query.query,
      query.limit,
    );
  }

  @Get('streams/:streamName/messages/:seq')
  async getMessage(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('seq', ParseIntPipe) seq: number,
  ): Promise<MessageDataDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.getMessage(conn.jsm, streamName, seq);
  }

  @Post('streams/:streamName/messages/:seq/replay')
  @HttpCode(HttpStatus.OK)
  async replayMessage(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() body: MessageReplayRequestDto,
  ): Promise<MessageReplayResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const replay = await this.messagesService.replayMessage(
      conn.js,
      conn.jsm,
      streamName,
      seq,
      body,
    );
    await this.auditService.log({
      action: 'message.replay',
      resourceType: 'message',
      resourceName: `${streamName}:${seq}`,
      connectionId,
      details: {
        source_stream: streamName,
        source_seq: seq,
        target_subject: body.target_subject,
        published_stream: replay.published_stream,
        published_seq: replay.published_seq,
      },
    });
    return replay;
  }

  @Post('streams/:streamName/consumers/:consumerName/remediation/fetch')
  @HttpCode(HttpStatus.OK)
  async fetchRemediationMessages(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('consumerName') consumerName: string,
    @Body() body: MessageRemediationFetchRequestDto,
  ): Promise<MessageRemediationFetchResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.fetchRemediationMessages(
      conn.js,
      conn.jsm,
      connectionId,
      streamName,
      consumerName,
      body,
    );
    await this.auditService.log({
      action: 'message.remediation.fetch',
      resourceType: 'consumer',
      resourceName: consumerName,
      connectionId,
      details: {
        stream: streamName,
        requested_batch_size: body.batch_size ?? 25,
        fetched: result.fetched,
        session_id: result.session_id,
        expires_at: result.expires_at,
      },
    });
    return result;
  }

  @Post('streams/:streamName/consumers/:consumerName/remediation/actions')
  @HttpCode(HttpStatus.OK)
  async applyRemediationAction(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('consumerName') consumerName: string,
    @Body() body: MessageRemediationActionRequestDto,
  ): Promise<MessageRemediationActionResponseDto> {
    const result = await this.messagesService.applyRemediationAction(
      connectionId,
      streamName,
      consumerName,
      body,
    );
    await this.auditService.log({
      action: 'message.remediation.action',
      resourceType: 'consumer',
      resourceName: consumerName,
      connectionId,
      details: {
        stream: streamName,
        action: body.action,
        requested_sequences: body.stream_sequences,
        handled: result.handled,
        failed: result.failed,
        remaining_session_messages: result.remaining_session_messages,
        results: result.results,
      },
    });
    return result;
  }

  @Post('streams/:streamName/messages/:seq/delete')
  @HttpCode(HttpStatus.OK)
  async deleteStreamMessage(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() body: MessageDeleteRequestDto,
  ): Promise<MessageDeleteResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.deleteStreamMessage(conn.jsm, streamName, seq, body);
    await this.auditService.log({
      action: 'message.delete',
      resourceType: 'message',
      resourceName: `${streamName}:${seq}`,
      connectionId,
      details: {
        stream: streamName,
        seq,
        erased: result.erased,
        deleted: result.deleted,
      },
    });
    return result;
  }

  @Post('streams/:streamName/messages/index/build')
  @HttpCode(HttpStatus.OK)
  async buildSearchIndex(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Body() body: BuildIndexRequestDto = {},
  ): Promise<BuildIndexResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.buildSearchIndex(
      conn.jsm,
      connectionId,
      streamName,
      body.limit,
    );
    await this.auditService.log({
      action: 'message.index_build',
      resourceType: 'stream',
      resourceName: streamName,
      connectionId,
      details: { limit: body.limit, indexed_messages: result.indexed_messages },
    });
    return result;
  }
}
