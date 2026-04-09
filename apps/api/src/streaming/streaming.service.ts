import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Content, StreamSession } from '@prisma/client';
import { ApiEnv } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';

interface SrsStream {
  id: number;
  name: string;
  vhost: string;
  app: string;
  live_ms: number;
  clients: number;
  frames: number;
  send_bytes: number;
  recv_bytes: number;
  kbps: { recv_30s: number; send_30s: number };
  publish: { active: boolean; cid: string };
  video: { codec: string; profile: string; level: string } | null;
  audio: { codec: string; sample_rate: number; channel: number } | null;
}

interface SrsStreamsResponse {
  code: number;
  server: string;
  streams: SrsStream[];
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  async onPublish(streamKey: string): Promise<void> {
    const content = await this.prisma.content.findUnique({ where: { streamKey } });
    if (!content) throw new NotFoundException('streamKey inválido');

    const hlsBaseUrl = this.config.get('HLS_BASE_URL', { infer: true });
    const hlsUrl = `${hlsBaseUrl}/live/${streamKey}.m3u8`;

    await this.prisma.$transaction([
      this.prisma.content.update({
        where: { streamKey },
        data: { status: 'ACTIVE', hlsUrl },
      }),
      this.prisma.streamSession.create({
        data: { contentId: content.id },
      }),
    ]);

    this.logger.log(`Stream ACTIVE: ${streamKey} → ${hlsUrl}`);
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

    this.logger.log(`Stream INACTIVE: ${streamKey}`);
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

  async getSrsStats(): Promise<{ srsReachable: boolean; activeStreams: number; streams: SrsStream[] }> {
    const srsUrl = this.config.get('SRS_INTERNAL_URL', { infer: true });

    try {
      const res = await fetch(`${srsUrl}/api/v1/streams`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) return { srsReachable: false, activeStreams: 0, streams: [] };

      const data = (await res.json()) as SrsStreamsResponse;
      const activeStreams = (data.streams ?? []).filter((s) => s.publish?.active).length;

      return { srsReachable: true, activeStreams, streams: data.streams ?? [] };
    } catch {
      return { srsReachable: false, activeStreams: 0, streams: [] };
    }
  }
}
