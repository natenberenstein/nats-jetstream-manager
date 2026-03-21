import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamMetric } from '../database/entities/stream-metric.entity';
import { ConsumerMetric } from '../database/entities/consumer-metric.entity';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([StreamMetric, ConsumerMetric])],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
