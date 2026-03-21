import { Module } from '@nestjs/common';
import { KvController } from './kv.controller';
import { KvService } from './kv.service';

@Module({
  controllers: [KvController],
  providers: [KvService],
  exports: [KvService],
})
export class KvModule {}
