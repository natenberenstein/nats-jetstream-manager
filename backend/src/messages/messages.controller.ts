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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import {
  MessagePublishRequestDto,
  MessagePublishBatchRequestDto,
  MessageReplayRequestDto,
  ValidateSchemaRequestDto,
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

  @Post('streams/:streamName/messages/index/build')
  @HttpCode(HttpStatus.OK)
  async buildSearchIndex(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
  ): Promise<BuildIndexResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    const result = await this.messagesService.buildSearchIndex(conn.jsm, connectionId, streamName);
    await this.auditService.log({
      action: 'message.index_build',
      resourceType: 'stream',
      resourceName: streamName,
      connectionId,
      details: { indexed_messages: result.indexed_messages },
    });
    return result;
  }
}
