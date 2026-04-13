import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateClipDto {
  contentId: string
  title: string
  startSec: number
  endSec: number
  thumbnailUrl?: string
  platforms?: string[]
}

const MAX_CLIP_DURATION = 600  // 10 minutes
const MIN_CLIP_DURATION = 5    // 5 seconds
const MAX_CLIPS_PER_DAY = 50

@Injectable()
export class ClipsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async create(channelId: string, dto: CreateClipDto) {
    const durationSec = dto.endSec - dto.startSec

    if (durationSec < MIN_CLIP_DURATION) {
      throw new BadRequestException(
        `Clip must be at least ${MIN_CLIP_DURATION} seconds`,
      )
    }
    if (durationSec > MAX_CLIP_DURATION) {
      throw new BadRequestException(
        `Clip cannot exceed ${MAX_CLIP_DURATION / 60} minutes`,
      )
    }

    // Verify content belongs to channel
    const content = await this.prisma.content.findFirst({
      where: { id: dto.contentId, channelId },
      select: { id: true, hlsUrl: true, localPath: true, title: true },
    })
    if (!content) throw new NotFoundException('Content not found in this channel')

    // Daily rate limit
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await this.prisma.clip.count({
      where: { channelId, createdAt: { gte: today } },
    })
    if (todayCount >= MAX_CLIPS_PER_DAY) {
      throw new BadRequestException(
        `Daily clip limit (${MAX_CLIPS_PER_DAY}) reached`,
      )
    }

    const clip = await this.prisma.clip.create({
      data: {
        channelId,
        contentId: dto.contentId,
        title: dto.title,
        startSec: dto.startSec,
        endSec: dto.endSec,
        durationSec,
        thumbnailUrl: dto.thumbnailUrl ?? null,
        platforms: dto.platforms ?? [],
        status: 'processing',
      },
      include: { content: { select: { title: true, type: true, hlsUrl: true } } },
    })

    // Simulate async processing (in production: queue FFmpeg job)
    void this.simulateProcessing(clip.id, content.hlsUrl)

    return clip
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async list(channelId: string, contentId?: string) {
    return this.prisma.clip.findMany({
      where: {
        channelId,
        ...(contentId ? { contentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { content: { select: { title: true, type: true, hlsUrl: true } } },
    })
  }

  // ── Get ───────────────────────────────────────────────────────────────────

  async getOne(channelId: string, clipId: string) {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, channelId },
      include: { content: { select: { title: true, type: true, hlsUrl: true } } },
    })
    if (!clip) throw new NotFoundException('Clip not found')
    return clip
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(channelId: string, clipId: string): Promise<void> {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, channelId },
      select: { id: true },
    })
    if (!clip) throw new NotFoundException('Clip not found')
    await this.prisma.clip.delete({ where: { id: clipId } })
  }

  // ── Publish to social (stub) ──────────────────────────────────────────────

  async publish(channelId: string, clipId: string, platforms: string[]) {
    await this.findOwned(channelId, clipId)

    // In production: call social platform APIs via OAuth tokens
    await this.prisma.clip.update({
      where: { id: clipId },
      data: { platforms },
    })

    return { published: platforms, clipId }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findOwned(channelId: string, clipId: string) {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, channelId },
      select: { id: true },
    })
    if (!clip) throw new NotFoundException('Clip not found')
    return clip
  }

  /** Stub: marks clip as ready after a short delay, sets hlsUrl from source */
  private async simulateProcessing(clipId: string, sourceHlsUrl: string | null) {
    // In production: spawn FFmpeg to extract segment and upload to CDN
    await new Promise((r) => setTimeout(r, 3_000))

    try {
      await this.prisma.clip.update({
        where: { id: clipId },
        data: {
          status: 'ready',
          // Use source HLS URL as a placeholder; real impl would point to clipped segment
          hlsUrl: sourceHlsUrl ?? undefined,
        },
      })
    } catch {
      await this.prisma.clip.update({
        where: { id: clipId },
        data: { status: 'failed' },
      }).catch(() => null)
    }
  }
}
