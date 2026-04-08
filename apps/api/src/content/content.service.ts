import { Injectable, NotFoundException } from '@nestjs/common';
import { Content } from '@prisma/client';
import { CreateContentDto } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  findByChannel(channelId: string): Promise<Content[]> {
    return this.prisma.content.findMany({
      where: { channelId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async findBySlug(channelId: string, slug: string): Promise<Content> {
    const content = await this.prisma.content.findFirst({
      where: { channelId, slug, status: 'published' },
    });
    if (!content) throw new NotFoundException(`Content '${slug}' not found`);
    return content;
  }

  create(dto: CreateContentDto): Promise<Content> {
    const slug = dto.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    return this.prisma.content.create({
      data: {
        title: dto.title,
        slug,
        type: dto.type,
        channelId: dto.channelId,
        status: 'draft',
        thumbnailUrl: dto.thumbnailUrl ?? null,
        duration: dto.duration ?? null,
      },
    });
  }
}
