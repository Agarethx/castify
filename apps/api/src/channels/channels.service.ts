import { Injectable, NotFoundException } from '@nestjs/common';
import { Channel as PrismaChannel } from '@prisma/client';
import { Channel } from '@castify/types';
import { CreateChannelDto } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<PrismaChannel[]> {
    return this.prisma.channel.findMany({ where: { isActive: true } });
  }

  async findBySlug(slug: string): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { slug } });
    if (!channel || !channel.isActive) {
      throw new NotFoundException(`Canal '${slug}' no encontrado`);
    }
    return channel;
  }

  async findById(id: string): Promise<PrismaChannel> {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException(`Canal '${id}' no encontrado`);
    return channel;
  }

  create(dto: CreateChannelDto): Promise<PrismaChannel> {
    return this.prisma.channel.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        plan: dto.plan,
        primaryColor: dto.primaryColor ?? '#000000',
        logoUrl: dto.logoUrl ?? null,
      },
    });
  }
}
