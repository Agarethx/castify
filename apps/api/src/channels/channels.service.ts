import { Injectable, NotFoundException } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { CreateChannelDto } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Channel[]> {
    return this.prisma.channel.findMany({ where: { isActive: true } });
  }

  async findBySlug(slug: string): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { slug } });
    if (!channel) throw new NotFoundException(`Channel '${slug}' not found`);
    return channel;
  }

  async findById(id: string): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException(`Channel '${id}' not found`);
    return channel;
  }

  create(dto: CreateChannelDto): Promise<Channel> {
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
