import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { FfmpegCommand } from 'fluent-ffmpeg'
import ffmpeg from 'fluent-ffmpeg'
import { ConfigService } from '@nestjs/config'
import { ApiEnv } from '@castify/validators'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultiStreamDestinations {
  youtube?:  { streamKey: string }
  facebook?: { pageId: string; accessToken: string }
  instagram?: { accountId: string; accessToken: string }
  tiktok?:   { streamKey: string }
}

/** Resolved config stored in Redis — includes the rtmpStreamKey for the source */
interface StoredMultiStreamConfig extends MultiStreamDestinations {
  contentId: string
  rtmpStreamKey: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MultiStreamingService {
  private readonly logger = new Logger(MultiStreamingService.name)

  /** Active ffmpeg processes keyed by contentId */
  private readonly processes = new Map<string, FfmpegCommand>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  async startMultistream(
    channelId: string,
    contentId: string,
    destinations: MultiStreamDestinations,
  ): Promise<{ contentId: string; destinations: string[] }> {
    if (this.processes.has(contentId)) {
      throw new BadRequestException('Multistream already running for this content')
    }

    // Validate ownership and get the real RTMP stream key
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId, status: 'ACTIVE' },
      select: { id: true, streamKey: true },
    })
    if (!content) {
      throw new NotFoundException('Active content not found for this channel')
    }

    const rtmpBase   = this.config.get('SRS_RTMP_URL', { infer: true })
    const sourceRtmp = `${rtmpBase}/live/${content.streamKey}`

    const outputs = this.buildOutputList(destinations)
    if (outputs.length === 0) {
      throw new BadRequestException('At least one destination (youtube, facebook, instagram, tiktok) is required')
    }

    // Build a multi-output ffmpeg command
    const cmd = ffmpeg()
      .input(sourceRtmp)
      .inputOptions(['-re'])  // read at native frame rate (important for live re-stream)

    for (const url of outputs) {
      cmd
        .output(url)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-b:v', '2500k',
          '-b:a', '128k',
          '-maxrate', '2996k',
          '-bufsize', '4200k',
          '-preset', 'veryfast',
          '-flvflags', 'no_duration_filesize',
          '-f', 'flv',
        ])
    }

    cmd.on('start', (command: string) => {
      this.logger.log(`[Multistream ${contentId}] Started (${outputs.length} destinations)`)
      this.logger.debug(`[Multistream ${contentId}] Command: ${command}`)
    })

    cmd.on('error', (err: Error) => {
      this.logger.error(`[Multistream ${contentId}] Error: ${err.message}`)
      this.processes.delete(contentId)
    })

    cmd.on('end', () => {
      this.logger.log(`[Multistream ${contentId}] Ended`)
      this.processes.delete(contentId)
    })

    this.processes.set(contentId, cmd)
    cmd.run()

    // Persist config in Redis (TTL 24h) so we can inspect active multistreams
    const stored: StoredMultiStreamConfig = { contentId, rtmpStreamKey: content.streamKey, ...destinations }
    await this.redis.set(
      `castify:multistream:${contentId}`,
      JSON.stringify(stored),
      'EX',
      86400,
    )

    return { contentId, destinations: this.labelDestinations(destinations) }
  }

  async stopMultistream(channelId: string, contentId: string): Promise<void> {
    // Validate ownership
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true },
    })
    if (!content) throw new NotFoundException('Content not found for this channel')

    const proc = this.processes.get(contentId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(contentId)
    }

    await this.redis.del(`castify:multistream:${contentId}`)
  }

  async getMultistreamStatus(channelId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true },
    })
    if (!content) throw new NotFoundException('Content not found for this channel')

    const raw = await this.redis.get(`castify:multistream:${contentId}`)
    const isRunning = this.processes.has(contentId)

    if (!raw) return { contentId, running: false, destinations: [] }

    const config = JSON.parse(raw) as StoredMultiStreamConfig
    return {
      contentId,
      running: isRunning,
      destinations: this.labelDestinations(config),
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildOutputList(destinations: MultiStreamDestinations): string[] {
    const outputs: string[] = []

    if (destinations.youtube) {
      outputs.push(`rtmp://a.rtmp.youtube.com/live2/${destinations.youtube.streamKey}`)
    }

    if (destinations.facebook) {
      // Facebook requires RTMPS
      outputs.push(
        `rtmps://live-api-s.facebook.com:443/rtmp/${destinations.facebook.pageId}` +
        `?s_bl=1&s_psm=1&access_token=${destinations.facebook.accessToken}`,
      )
    }

    if (destinations.instagram) {
      outputs.push(
        `rtmps://live-api-s.instagram.com:443/rtmp/${destinations.instagram.accountId}` +
        `?access_token=${destinations.instagram.accessToken}`,
      )
    }

    if (destinations.tiktok) {
      outputs.push(`rtmp://broadcast.tiktok.com/live/${destinations.tiktok.streamKey}`)
    }

    return outputs
  }

  private labelDestinations(destinations: MultiStreamDestinations): string[] {
    const labels: string[] = []
    if (destinations.youtube)   labels.push('youtube')
    if (destinations.facebook)  labels.push('facebook')
    if (destinations.instagram) labels.push('instagram')
    if (destinations.tiktok)    labels.push('tiktok')
    return labels
  }
}
