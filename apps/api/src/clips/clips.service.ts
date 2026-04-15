import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateClipDto {
  contentId: string
  title: string
  startSec: number
  endSec: number
  thumbnailUrl?: string
  platforms?: string[]
}

const MAX_CLIP_DURATION = 600   // 10 minutes
const MIN_CLIP_DURATION = 5     // 5 seconds
const MAX_CLIPS_PER_DAY = 50

@Injectable()
export class ClipsService {
  private readonly logger  = new Logger(ClipsService.name)
  private readonly clipsDir:   string
  private readonly hlsBaseUrl: string

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {
    this.clipsDir   = this.config.get<string>('HLS_CLIPS_DIR') ?? '/tmp/castify-clips'
    this.hlsBaseUrl = this.config.get<string>('HLS_BASE_URL')  ?? 'http://localhost:8081'
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(channelId: string, dto: CreateClipDto) {
    const durationSec = dto.endSec - dto.startSec

    if (durationSec < MIN_CLIP_DURATION) {
      throw new BadRequestException(`Clip must be at least ${MIN_CLIP_DURATION} seconds`)
    }
    if (durationSec > MAX_CLIP_DURATION) {
      throw new BadRequestException(`Clip cannot exceed ${MAX_CLIP_DURATION / 60} minutes`)
    }

    // Verify content belongs to channel; grab localPath for FFmpeg input
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
      throw new BadRequestException(`Daily clip limit (${MAX_CLIPS_PER_DAY}) reached`)
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
        platforms:   dto.platforms ?? [],
        status: 'processing',
      },
      include: { content: { select: { title: true, type: true, hlsUrl: true } } },
    })

    // Kick off async FFmpeg job
    void this.processClip(
      clip.id,
      dto.startSec,
      durationSec,
      content.localPath,
      content.hlsUrl,
    )

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

  // ── Get one ───────────────────────────────────────────────────────────────

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

    // Best-effort cleanup of the output files
    const outDir = path.join(this.clipsDir, clipId)
    fs.promises.rm(outDir, { recursive: true, force: true }).catch(() => null)
  }

  // ── Publish stub ──────────────────────────────────────────────────────────

  async publish(channelId: string, clipId: string, platforms: string[]) {
    await this.findOwned(channelId, clipId)
    await this.prisma.clip.update({ where: { id: clipId }, data: { platforms } })
    return { published: platforms, clipId }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findOwned(channelId: string, clipId: string) {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, channelId },
      select: { id: true },
    })
    if (!clip) throw new NotFoundException('Clip not found')
    return clip
  }

  /**
   * Trims the source video to [startSec, startSec + durationSec] using FFmpeg
   * and stores the result as an HLS file under clipsDir/{clipId}/index.m3u8.
   *
   * Input priority:
   *   1. localPath  — the original uploaded file (fast, no re-download)
   *   2. hlsUrl     — the HLS playlist URL (works for live recordings too)
   */
  private async processClip(
    clipId:      string,
    startSec:    number,
    durationSec: number,
    localPath:   string | null,
    hlsUrl:      string | null,
  ): Promise<void> {
    const inputSource = localPath ?? hlsUrl
    if (!inputSource) {
      this.logger.warn(`[Clip ${clipId}] No input source — marking as failed`)
      await this.prisma.clip.update({
        where: { id: clipId },
        data:  { status: 'failed' },
      }).catch(() => null)
      return
    }

    const outDir  = path.join(this.clipsDir, clipId)
    const outFile = path.join(outDir, 'index.m3u8')
    const clipUrl = `${this.hlsBaseUrl}/clips/${clipId}/index.m3u8`

    try {
      await fs.promises.mkdir(outDir, { recursive: true })

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputSource)
          // Fast input seek (keyframe-accurate) — much faster than output seek
          .inputOptions(['-ss', String(startSec)])
          // Trim to clip duration
          .duration(durationSec)
          .outputOptions([
            '-c', 'copy',                         // no re-encode, preserve quality
            '-hls_time', '4',                     // ~4s segments
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', path.join(outDir, 'seg%04d.ts'),
            '-movflags', '+faststart',
          ])
          .output(outFile)
          .on('start', (cmd: string) => {
            this.logger.debug(`[Clip ${clipId}] FFmpeg: ${cmd}`)
          })
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run()
      })

      await this.prisma.clip.update({
        where: { id: clipId },
        data:  { status: 'ready', hlsUrl: clipUrl },
      })

      this.logger.log(`[Clip ${clipId}] Done → ${clipUrl}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[Clip ${clipId}] FFmpeg failed: ${msg}`)

      await this.prisma.clip.update({
        where: { id: clipId },
        data:  { status: 'failed' },
      }).catch(() => null)
    }
  }
}
