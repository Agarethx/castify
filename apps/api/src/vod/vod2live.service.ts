import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FfmpegCommand } from 'fluent-ffmpeg'
import ffmpeg from 'fluent-ffmpeg'
import { ApiEnv } from '@castify/validators'
import { PrismaService } from '../prisma/prisma.service'

export interface VOD2LiveRequest {
  contentId: string
  channelId: string
  startSeconds?: number
  endSeconds?: number
  goLiveAt?: Date
}

@Injectable()
export class Vod2LiveService {
  private readonly logger = new Logger(Vod2LiveService.name)

  /** Active ffmpeg processes, keyed by contentId */
  private readonly processes = new Map<string, FfmpegCommand>()

  /** Scheduled timers for deferred broadcasts */
  private readonly timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  async startVOD2Live(req: VOD2LiveRequest): Promise<{ streamKey: string; scheduledAt?: Date }> {
    const { contentId, channelId, startSeconds = 0, endSeconds, goLiveAt } = req

    if (this.processes.has(contentId)) {
      throw new ConflictException('VOD2Live already running for this content')
    }

    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId, type: 'VOD' },
      select: { localPath: true, durationSec: true },
    })

    if (!content) throw new NotFoundException('VOD content not found')
    if (!content.localPath) throw new NotFoundException('VOD file not available')

    const duration = (endSeconds ?? content.durationSec ?? 0) - startSeconds
    const streamKey = `vod2live_${contentId}`

    if (goLiveAt && goLiveAt > new Date()) {
      // Schedule for later — mark as scheduled but don't start yet
      const delayMs = goLiveAt.getTime() - Date.now()
      const timer = setTimeout(() => {
        this.timers.delete(contentId)
        void this.launch(contentId, content.localPath!, startSeconds, duration, streamKey)
      }, delayMs)
      this.timers.set(contentId, timer)
      this.logger.log(`[VOD2Live ${contentId}] Scheduled for ${goLiveAt.toISOString()}`)
      return { streamKey, scheduledAt: goLiveAt }
    }

    await this.launch(contentId, content.localPath, startSeconds, duration, streamKey)
    return { streamKey }
  }

  async stopVOD2Live(contentId: string, channelId: string): Promise<void> {
    // Cancel a pending scheduled broadcast
    const timer = this.timers.get(contentId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(contentId)
    }

    // Kill the running process
    const proc = this.processes.get(contentId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(contentId)
    }

    // Restore status to ACTIVE only if this channel owns the content
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true, status: true },
    })
    if (!content) throw new NotFoundException('VOD content not found')

    if (content.status === 'VOD2LIVE') {
      await this.prisma.content.update({
        where: { id: contentId },
        data: { status: 'ACTIVE' },
      })
    }
  }

  private async launch(
    contentId: string,
    localPath: string,
    startSeconds: number,
    duration: number,
    streamKey: string,
  ): Promise<void> {
    const rtmpBase = this.config.get('SRS_RTMP_URL', { infer: true })
    const rtmpUrl = `${rtmpBase}/live/${streamKey}`

    await this.prisma.content.update({
      where: { id: contentId },
      data: { status: 'VOD2LIVE' },
    })

    const proc = ffmpeg()
      .inputOptions([
        '-stream_loop', '-1',
        '-ss', String(startSeconds),
        ...(duration > 0 ? ['-t', String(duration)] : []),
      ])
      .input(localPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .outputFormat('flv')
      .output(rtmpUrl)

    proc.on('start', (cmd: string) => {
      this.logger.log(`[VOD2Live ${contentId}] Started: ${cmd}`)
    })

    proc.on('error', (err: Error) => {
      this.logger.error(`[VOD2Live ${contentId}] FFmpeg error: ${err.message}`)
      this.processes.delete(contentId)
      void this.prisma.content
        .update({ where: { id: contentId }, data: { status: 'ACTIVE' } })
        .catch(() => null)
    })

    proc.on('end', () => {
      this.logger.log(`[VOD2Live ${contentId}] Stream ended`)
      this.processes.delete(contentId)
      void this.prisma.content
        .update({ where: { id: contentId }, data: { status: 'ACTIVE' } })
        .catch(() => null)
    })

    this.processes.set(contentId, proc)
    proc.run()
  }
}
