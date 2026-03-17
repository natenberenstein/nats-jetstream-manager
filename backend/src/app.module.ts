import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ConnectionsModule } from './connections/connections.module';
import { StreamsModule } from './streams/streams.module';
import { ConsumersModule } from './consumers/consumers.module';
import { MessagesModule } from './messages/messages.module';
import { ClusterModule } from './cluster/cluster.module';
import { SystemModule } from './system/system.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthHistoryModule } from './health-history/health-history.module';
import { AuditModule } from './audit/audit.module';
import { JobsModule } from './jobs/jobs.module';
import * as path from 'path';
import * as fs from 'fs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: configService.get<string>('LOG_LEVEL', isProduction ? 'info' : 'debug'),
            transport: isProduction
              ? undefined
              : { target: 'pino-pretty', options: { colorize: true } },
            autoLogging: { ignore: (req) => (req as { url?: string }).url === '/health' },
          },
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbPath = configService.get<string>('DATABASE_PATH', './data/nats_manager.db');
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        return {
          type: 'better-sqlite3',
          database: dbPath,
          autoLoadEntities: true,
          synchronize: true,
        };
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    ConnectionsModule,
    StreamsModule,
    ConsumersModule,
    MessagesModule,
    ClusterModule,
    SystemModule,
    MetricsModule,
    HealthHistoryModule,
    AuditModule,
    JobsModule,
  ],
  providers: [],
})
export class AppModule {}
