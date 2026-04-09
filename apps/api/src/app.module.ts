import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ApiEnvSchema } from '@castify/validators';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { ChannelsModule } from './channels/channels.module';
import { StreamingModule } from './streaming/streaming.module';
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
    PrismaModule,
    RedisModule,
    AuthModule,
    TenantModule,
    ChannelsModule,
    StreamingModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
