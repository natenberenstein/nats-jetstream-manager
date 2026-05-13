import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessageDeleteService } from './message-delete.service';
import { MessageIndexService } from './message-index.service';
import { MessagePublisherService } from './message-publisher.service';
import { MessageReaderService } from './message-reader.service';
import { MessageRemediationService } from './message-remediation.service';
import { MessageReplayService } from './message-replay.service';
import { SchemaValidationService } from './schema-validation.service';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessageDeleteService,
    MessageIndexService,
    MessagePublisherService,
    MessageReaderService,
    MessageRemediationService,
    MessageReplayService,
    SchemaValidationService,
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
