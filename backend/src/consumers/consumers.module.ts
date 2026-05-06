import { Module } from '@nestjs/common';
import { ConsumerDiagnosticsController, ConsumersController } from './consumers.controller';
import { ConsumersService } from './consumers.service';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [StreamsModule],
  controllers: [ConsumerDiagnosticsController, ConsumersController],
  providers: [ConsumersService],
  exports: [ConsumersService],
})
export class ConsumersModule {}
