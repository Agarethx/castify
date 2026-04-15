import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import ffmpeg from 'fluent-ffmpeg';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VodService {
  private readonly logger = new Logger(VodService.name);
  private readonly uploadDir: string;
  private readonly hlsVodDir: string;
  private readonly hlsBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.uploadDir  = this.config.get<string>('VOD_UPLOAD_DIR') ?? '/tmp/castify-uploads';
    this.hlsVodDir  = this.config.get<string>('HLS_VOD_DIR')    ?? '/var/hls/vod';
    this.hlsBaseUrl = this.config.get<string>('HLS_BASE_URL')   ?? 'http://localhost:8081';
  }

  // ── Upload + kick off background processing ──────────────────────────────────

  async uploadAndProcess(
    channelId: string,
    file: MultipartFile,
  ): Promise<{ contentId: string; status: string }> {
    // 1. Create Content record immediately (gets auto-generated UUID)
    const title = path.basename(file.filename, path.extname(file.filename)) || 'Sin título';
    const content = await this.prisma.content.create({
      data: { channelId, title, type: 'VOD', status: 'PROCESSING' },
    });

    // 2. Persist the uploaded file to disk
    const uploadDir = path.join(this.uploadDir, content.id);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const inputPath = path.join(uploadDir, 'original.mp4');

    const writeStream = fs.createWriteStream(inputPath);
    await pipeline(file.file, writeStream);

    // 3. Record the local path
    await this.prisma.content.update({
      where: { id: content.id },
      data: { localPath: inputPath },
    });

    // 4. Fire FFmpeg in background — intentionally NOT awaited
    void this.processWithFfmpeg(content.id, inputPath);

    return { contentId: content.id, status: 'PROCESSING' };
  }

  // ── Status polling ───────────────────────────────────────────────────────────

  async getVodStatus(channelId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true, status: true, hlsUrl: true, durationSec: true },
    });

    if (!content) throw new NotFoundException('Contenido no encontrado');

    return {
      contentId: content.id,
      status:    content.status,
      hlsUrl:    content.hlsUrl,
      durationSec: content.durationSec,
    };
  }

  // ── List all channel contents ─────────────────────────────────────────────────

  async getMyContents(channelId: string) {
    return this.prisma.content.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── FFmpeg transcode (runs fully in background) ───────────────────────────────

  private async processWithFfmpeg(contentId: string, inputPath: string): Promise<void> {
    const outDir = path.join(this.hlsVodDir, contentId);
    await fs.promises.mkdir(outDir, { recursive: true });

    return new Promise<void>((resolve) => {
      const proc = ffmpeg(inputPath)
        .complexFilter([
          '[0:v]split=3[v1][v2][v3]',
          '[v1]scale=w=1280:h=720[720p]',
          '[v2]scale=w=854:h=480[480p]',
          '[v3]scale=w=640:h=360[360p]',
        ])
        // ── 720p output ──────────────────────────────────────────────────────
        .output(path.join(outDir, '720p.m3u8'))
        .outputOptions([
          '-map', '[720p]', '-map', '0:a',
          '-c:v', 'libx264', '-b:v', '2800k', '-maxrate', '2996k', '-bufsize', '4200k',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          '-hls_time', '4', '-hls_playlist_type', 'vod',
          '-hls_segment_filename', path.join(outDir, '720p_%04d.ts'),
        ])
        // ── 480p output ──────────────────────────────────────────────────────
        .output(path.join(outDir, '480p.m3u8'))
        .outputOptions([
          '-map', '[480p]', '-map', '0:a',
          '-c:v', 'libx264', '-b:v', '1400k', '-maxrate', '1498k', '-bufsize', '2100k',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          '-hls_time', '4', '-hls_playlist_type', 'vod',
          '-hls_segment_filename', path.join(outDir, '480p_%04d.ts'),
        ])
        // ── 360p output ──────────────────────────────────────────────────────
        .output(path.join(outDir, '360p.m3u8'))
        .outputOptions([
          '-map', '[360p]', '-map', '0:a',
          '-c:v', 'libx264', '-b:v', '800k', '-maxrate', '856k', '-bufsize', '1200k',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          '-hls_time', '4', '-hls_playlist_type', 'vod',
          '-hls_segment_filename', path.join(outDir, '360p_%04d.ts'),
        ])
        .on('progress', (p) => {
          this.logger.log(
            `[VOD ${contentId}] Processing: ${p.percent != null ? p.percent.toFixed(1) : '?'}%`,
          );
        })
        .on('end', () => {
          void this.onFfmpegEnd(contentId, inputPath, outDir).finally(resolve);
        })
        .on('error', (err: Error) => {
          void this.onFfmpegError(contentId, err).finally(resolve);
        });

      proc.run();
    });
  }

  // ── Post-processing after FFmpeg finishes ────────────────────────────────────

  private async onFfmpegEnd(contentId: string, inputPath: string, outDir: string): Promise<void> {
    try {
      const master = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720',
        '720p.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480',
        '480p.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
        '360p.m3u8',
      ].join('\n');

      await fs.promises.writeFile(path.join(outDir, 'index.m3u8'), master, 'utf-8');

      const durationSec = await this.probeVideoDuration(inputPath);

      await this.prisma.content.update({
        where: { id: contentId },
        data: {
          status: 'ACTIVE',
          hlsUrl: `${this.hlsBaseUrl}/vod/${contentId}/index.m3u8`,
          durationSec,
        },
      });

      this.logger.log(`[VOD ${contentId}] Processing complete. Duration: ${durationSec}s`);
    } catch (err) {
      this.logger.error(`[VOD ${contentId}] Post-processing error: ${String(err)}`);
      await this.prisma.content
        .update({ where: { id: contentId }, data: { status: 'ERROR' } })
        .catch(() => null);
    }
  }

  private async onFfmpegError(contentId: string, err: Error): Promise<void> {
    this.logger.error(`[VOD ${contentId}] FFmpeg error: ${err.message}`);
    await this.prisma.content
      .update({ where: { id: contentId }, data: { status: 'ERROR' } })
      .catch(() => null);
  }

  // ── ffprobe helper ───────────────────────────────────────────────────────────

  private probeVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, meta) => {
        if (err || !meta?.format?.duration) {
          resolve(0);
        } else {
          resolve(Math.round(meta.format.duration));
        }
      });
    });
  }
}
