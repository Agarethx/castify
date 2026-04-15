import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ApiEnv } from '@castify/validators';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(configService: ConfigService<ApiEnv, true>) {
    super(configService.get('REDIS_URL', { infer: true }));
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
