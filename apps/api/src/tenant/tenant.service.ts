import { Injectable, NotFoundException } from '@nestjs/common';
import { Channel } from '@castify/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TENANT_TTL = 60 * 5; // 5 minutes

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async resolveBySlug(slug: string): Promise<Channel> {
    const cacheKey = `tenant:${slug}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Channel;
    }

    const channel = await this.prisma.channel.findUnique({ where: { slug } });
    if (!channel || !channel.isActive) {
      throw new NotFoundException(`Canal '${slug}' no encontrado`);
    }

    const result: Channel = {
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      logoUrl: channel.logoUrl,
      primaryColor: channel.primaryColor,
      plan: channel.plan,
      isActive: channel.isActive,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', TENANT_TTL);
    return result;
  }
}
