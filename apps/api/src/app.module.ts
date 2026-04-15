import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ApiEnvSchema } from '@castify/validators';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { ChannelsModule } from './channels/channels.module';
import { StreamingModule } from './streaming/streaming.module';
import { VodModule } from './vod/vod.module';
import { PrivateSessionsModule } from './private-sessions/private-sessions.module';
import { EpgModule } from './epg/epg.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CastifyVideoModule } from './castify-video/castify-video.module';
import { DashboardModule } from './dashboard/dashboard.module'
import { ClipsModule } from './clips/clips.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: (config: Record<string, unknown>) => {
        const result = ApiEnvSchema.safeParse(config);
        if (!result.success) {
          throw new Error(`Config validation error: ${result.error.toString()}`);
        }
        return result.data;
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,   // 1 minute window
        limit: 100,    // general API limit
      },
      {
        name: 'sessions',
        ttl: 60_000,
        limit: 100,    // private sessions: 100 creates/min per IP
      },
      {
        name: 'multistream',
        ttl: 60_000,
        limit: 10,     // multistream start/stop: 10/min per IP
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    TenantModule,
    ChannelsModule,
    StreamingModule,
    VodModule,
    PrivateSessionsModule,
    EpgModule,
    AnalyticsModule,
    CastifyVideoModule,
    DashboardModule,
    ClipsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
