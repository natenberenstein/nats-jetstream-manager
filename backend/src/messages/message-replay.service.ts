import { Injectable, NotFoundException } from '@nestjs/common';
import {
  JetStreamClient,
  JetStreamManager,
  MsgHdrs,
  StoredMsg,
  headers as natsHeaders,
} from 'nats';
import { MessageReplayRequestDto, MessageReplayResponseDto } from './dto/message.dto';

@Injectable()
export class MessageReplayService {
  async replayMessage(
    js: JetStreamClient,
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    request: MessageReplayRequestDto,
  ): Promise<MessageReplayResponseDto> {
    let sm: StoredMsg;
    try {
      sm = await jsm.streams.getMessage(streamName, { seq });
    } catch {
      throw new NotFoundException(`Message with sequence ${seq} not found in stream ${streamName}`);
    }

    let headers: MsgHdrs | undefined;
    const shouldHaveHeaders =
      (request.copy_headers && sm.header) ||
      (request.extra_headers && Object.keys(request.extra_headers).length > 0);

    if (shouldHaveHeaders) {
      headers = natsHeaders();

      if (request.copy_headers && sm.header) {
        for (const key of sm.header.keys()) {
          headers.set(key, sm.header.get(key));
        }
      }

      if (request.extra_headers) {
        for (const [key, value] of Object.entries(request.extra_headers)) {
          headers.set(key, value);
        }
      }
    }

    const pa = await js.publish(request.target_subject, sm.data, { headers });

    return {
      source_stream: streamName,
      source_seq: seq,
      target_subject: request.target_subject,
      published_stream: pa.stream,
      published_seq: pa.seq,
    };
  }
}
