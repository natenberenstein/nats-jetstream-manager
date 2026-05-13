import { Injectable } from '@nestjs/common';
import { JetStreamClient, StringCodec } from 'nats';
import {
  MessagePublishBatchResponseDto,
  MessagePublishRequestDto,
  MessagePublishResponseDto,
} from './dto/message.dto';
import { createNatsHeaders } from './message-codec';

const sc = StringCodec();

@Injectable()
export class MessagePublisherService {
  async publishMessage(
    js: JetStreamClient,
    request: MessagePublishRequestDto,
  ): Promise<MessagePublishResponseDto> {
    const payload = typeof request.data === 'string' ? request.data : JSON.stringify(request.data);
    const headers = createNatsHeaders(request.headers);

    const pa = await js.publish(request.subject, sc.encode(payload), { headers });

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
      results.push(await this.publishMessage(js, msg));
    }

    return {
      published: results.length,
      results,
    };
  }
}
