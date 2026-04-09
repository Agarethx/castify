import { Injectable, NotFoundException } from '@nestjs/common';
import { Content, StreamSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StreamingService {
  constructor(private readonly prisma: PrismaService) {}

  async onPublish(streamKey: string): Promise<void> {
    const content = await this.prisma.content.findUnique({ where: { streamKey } });
    if (!content) throw new NotFoundException('streamKey inválido');

    const hlsUrl = `/hls/${streamKey}/index.m3u8`;

    await this.prisma.$transaction([
      this.prisma.content.update({
        where: { streamKey },
        data: { status: 'ACTIVE', hlsUrl },
      }),
      this.prisma.streamSession.create({
        data: { contentId: content.id },
      }),
    ]);
  }

  async onUnpublish(streamKey: string): Promise<void> {
    const content = await this.prisma.content.findUnique({ where: { streamKey } });
    if (!content) throw new NotFoundException('streamKey inválido');

    await this.prisma.content.update({
      where: { streamKey },
      data: { status: 'INACTIVE' },
    });

    await this.prisma.streamSession.updateMany({
      where: { contentId: content.id, endedAt: null },
      data: { endedAt: new Date() },
    });
  }

  async getStatus(streamKey: string): Promise<{
    content: Content;
    activeSession: StreamSession | null;
  }> {
    const content = await this.prisma.content.findUnique({ where: { streamKey } });
    if (!content) throw new NotFoundException('streamKey inválido');

    const activeSession = await this.prisma.streamSession.findFirst({
      where: { contentId: content.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    return { content, activeSession };
  }
}
