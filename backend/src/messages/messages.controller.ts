import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
import { AdminGuard } from '../common/guards/admin.guard';
import { ConnectionsService } from '../connections/connections.service';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('connections/:connectionId')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  @Post('messages/publish')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async publishMessage(
    @Param('connectionId') connectionId: string,
    @Body() body: MessagePublishRequestDto,
  ): Promise<MessagePublishResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.publishMessage(conn.js, body);
  }

  @Post('messages/publish-batch')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async publishBatch(
    @Param('connectionId') connectionId: string,
    @Body() body: MessagePublishBatchRequestDto,
  ): Promise<MessagePublishBatchResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.publishBatch(conn.js, body.messages);
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
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async replayMessage(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() body: MessageReplayRequestDto,
  ): Promise<MessageReplayResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.replayMessage(conn.js, conn.jsm, streamName, seq, body);
  }

  @Post('streams/:streamName/messages/index/build')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async buildSearchIndex(
    @Param('connectionId') connectionId: string,
    @Param('streamName') streamName: string,
  ): Promise<BuildIndexResponseDto> {
    const conn = this.connectionsService.getConnection(connectionId);
    return this.messagesService.buildSearchIndex(conn.jsm, connectionId, streamName);
  }
}
