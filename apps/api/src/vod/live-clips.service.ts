import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import { ApiEnv } from '@castify/validators'
import type { SessionSnapshot } from '@castify/types'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class LiveClipsService {
  private readonly logger = new Logger(LiveClipsService.name)
  private readonly clipsDir: string
  private readonly hlsBaseUrl: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {
    this.clipsDir   = this.config.get('HLS_CLIPS_DIR', { infer: true })
    this.hlsBaseUrl = this.config.get('HLS_BASE_URL',  { infer: true })
  }

  async createClip(
    contentId: string,
    channelId: string,
    clipDurationSec = 30,
  ): Promise<{ clipId: string; url: string; status: string }> {
    // 1. Validate content belongs to this channel and is currently live
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId, type: 'LIVE', status: 'ACTIVE' },
      select: { id: true, hlsUrl: true, streamKey: true, channelId: true },
    })

    if (!content) {
      throw new NotFoundException('Active LIVE content not found for this channel')
    }
    if (!content.hlsUrl) {
      throw new BadRequestException('Stream has no HLS URL — is it currently live?')
    }

    // 2. Check recent snapshots to confirm the stream has data
    //    Actual Redis key used by StreamingService: castify:snapshots:{channelId}
    const key       = `castify:snapshots:${content.channelId}`
    const rawItems  = await this.redis.lrange(key, -20, -1)  // last 20 snapshots (~100s)
    const now       = Date.now()
    const windowMs  = clipDurationSec * 1000

    const recentSnap = rawItems
      .map((s) => JSON.parse(s) as SessionSnapshot)
      .find((s) => s.contentId === contentId && s.timestamp >= now - windowMs)

    if (!recentSnap) {
      throw new BadRequestException('No recent viewer data — stream may not have active viewers')
    }

    // 3. Create a Clip record in DB immediately so we can return clipId
    const clipId     = randomUUID()
    const outputDir  = path.join(this.clipsDir, clipId)
    const outputPath = path.join(outputDir, 'index.m3u8')
    const clipUrl    = `${this.hlsBaseUrl}/clips/${clipId}/index.m3u8`
    const title      = `Clip ${new Date().toISOString()}`

    const clip = await this.prisma.clip.create({
      data: {
        id: clipId,
        contentId,
        title,
        durationSec: clipDurationSec,
        url: clipUrl,
        outputPath,
        status: 'processing',
      },
    })

    // 4. Extract clip asynchronously — caller gets clipId right away
    void this.extractClipAsync(clip.id, content.hlsUrl, outputDir, outputPath, clipDurationSec)

    return { clipId: clip.id, url: clipUrl, status: 'processing' }
  }

  async listClips(contentId: string, channelId: string) {
    // Validate ownership
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true },
    })
    if (!content) throw new NotFoundException('Content not found')

    return this.prisma.clip.findMany({
      where: { contentId },
      select: { id: true, title: true, durationSec: true, status: true, url: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async extractClipAsync(
    clipId: string,
    hlsUrl: string,
    outputDir: string,
    outputPath: string,
    durationSec: number,
  ): Promise<void> {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true })

      await new Promise<void>((resolve, reject) => {
        ffmpeg(hlsUrl)
          .inputOptions(['-live_start_index', '-3'])   // start from 3 segments before end
          .outputOptions([
            '-t', String(durationSec),
            '-c', 'copy',
            '-hls_time', '4',
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', path.join(outputDir, 'seg%04d.ts'),
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run()
      })

      await this.prisma.clip.update({
        where: { id: clipId },
        data: { status: 'ready' },
      })

      this.logger.log(`[Clip ${clipId}] Ready`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[Clip ${clipId}] FFmpeg error: ${msg}`)

      await this.prisma.clip.update({
        where: { id: clipId },
        data: { status: 'error' },
      }).catch(() => null)
    }
  }
}
