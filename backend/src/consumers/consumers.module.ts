import { Module } from '@nestjs/common';
import { ConsumersController } from './consumers.controller';
import { ConsumersService } from './consumers.service';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [StreamsModule],
  controllers: [ConsumersController],
  providers: [ConsumersService],
  exports: [ConsumersService],
})
export class ConsumersModule {}
