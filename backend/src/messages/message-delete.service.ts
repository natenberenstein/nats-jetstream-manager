import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JetStreamManager } from 'nats';
import { isNatsNotFound } from '../common/nats/errors';
import { MessageDeleteRequestDto, MessageDeleteResponseDto } from './dto/message.dto';

@Injectable()
export class MessageDeleteService {
  async deleteStreamMessage(
    jsm: JetStreamManager,
    streamName: string,
    seq: number,
    request: MessageDeleteRequestDto,
  ): Promise<MessageDeleteResponseDto> {
    const erase = request.erase ?? true;
    if (request.confirm_stream_name !== streamName || request.confirm_seq !== seq) {
      throw new BadRequestException(
        `Delete confirmation must match stream '${streamName}' and sequence ${seq}`,
      );
    }

    try {
      await jsm.streams.getMessage(streamName, { seq });
    } catch (error: unknown) {
      if (isNatsNotFound(error)) {
        throw new NotFoundException(
          `Message with sequence ${seq} not found in stream ${streamName}`,
        );
      }
      throw new NotFoundException(`Message with sequence ${seq} not found in stream ${streamName}`);
    }

    let deleted: boolean;
    try {
      deleted = await jsm.streams.deleteMessage(streamName, seq, erase);
    } catch (error: unknown) {
      if (isNatsNotFound(error)) {
        throw new NotFoundException(
          `Message with sequence ${seq} not found in stream ${streamName}`,
        );
      }
      throw error;
    }

    if (!deleted) {
      throw new NotFoundException(`Message with sequence ${seq} not found in stream ${streamName}`);
    }

    return {
      success: true,
      stream_name: streamName,
      seq,
      erased: erase,
      deleted,
    };
  }
}
