import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectionHealth } from '../database/entities/connection-health.entity';
import { HealthHistoryController } from './health-history.controller';
import { HealthHistoryService } from './health-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConnectionHealth])],
  controllers: [HealthHistoryController],
  providers: [HealthHistoryService],
  exports: [HealthHistoryService],
})
export class HealthHistoryModule {}
