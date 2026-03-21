import { Module } from '@nestjs/common';
import { ObjectStoreController } from './objectstore.controller';
import { ObjectStoreService } from './objectstore.service';

@Module({
  controllers: [ObjectStoreController],
  providers: [ObjectStoreService],
  exports: [ObjectStoreService],
})
export class ObjectStoreModule {}
