import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Content, StreamSession } from '@prisma/client';
import { ApiEnv, SessionSnapshotSchema } from '@castify/validators';
import type { NetworkConfig, SessionSnapshot } from '@castify/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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

const DEFAULT_NETWORK_CONFIG = {
  minBufferToUsePeerSec: 8,
  maxPeerLatencyMs: 800,
  peerScoreThreshold: 0.3,
  topIspsByOffload: [] as string[],
  peakHours: [] as number[],
  avgNetworkOffloadPct: 0,
} as const;

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  /** Throttle DB writes: channelId → last update timestamp */
  private readonly lastDbUpdate = new Map<string, number>();
  private readonly DB_UPDATE_INTERVAL_MS = 30_000;
  private readonly SNAPSHOTS_PER_CHANNEL = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApiEnv, true>,
    private readonly redis: RedisService,
  ) {}

  // ── SRS Webhooks ──────────────────────────────────────────────────────────

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

  // ── Stream status ─────────────────────────────────────────────────────────

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

  // ── Session snapshot ──────────────────────────────────────────────────────

  async saveSnapshot(raw: unknown): Promise<void> {
    const result = SessionSnapshotSchema.safeParse(raw);
    if (!result.success) {
      this.logger.warn(`Snapshot inválido: ${result.error.message}`);
      return;
    }
    const snapshot = result.data as SessionSnapshot;
    const key = `castify:snapshots:${snapshot.channelId}`;

    // Guardar en lista circular Redis — últimos 500 snapshots por canal
    await this.redis.rpush(key, JSON.stringify(snapshot));
    await this.redis.ltrim(key, -this.SNAPSHOTS_PER_CHANNEL, -1);

    // Actualizar DB cada 30s para no saturar PostgreSQL
    const now = Date.now();
    const last = this.lastDbUpdate.get(snapshot.channelId) ?? 0;
    if (now - last >= this.DB_UPDATE_INTERVAL_MS && snapshot.status === 'playing') {
      this.lastDbUpdate.set(snapshot.channelId, now);
      await this.prisma.streamSession.updateMany({
        where: { content: { channelId: snapshot.channelId }, endedAt: null },
        data: {
          bytesFromPeers: BigInt(Math.round(snapshot.bytesFromPeers)),
          bytesFromCdn:   BigInt(Math.round(snapshot.bytesFromCdn)),
          p2pOffloadPct:  snapshot.p2pOffloadPct,
          avgLatencyMs:   Math.round(snapshot.avgPeerLatencyMs),
          peersConnected: snapshot.peersConnected,
        },
      }).catch((err: unknown) => {
        this.logger.warn(`DB update skipped: ${String(err)}`);
      });
    }
  }

  // ── Network config ────────────────────────────────────────────────────────

  async getNetworkConfig(channelId: string): Promise<NetworkConfig> {
    const cached = await this.redis.get(`castify:config:${channelId}`);
    if (cached) return JSON.parse(cached) as NetworkConfig;

    return { channelId, updatedAt: Date.now(), ...DEFAULT_NETWORK_CONFIG };
  }

  // ── SRS stats ─────────────────────────────────────────────────────────────

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

  // ── Helpers for NIS ───────────────────────────────────────────────────────

  async getActiveChannelIds(): Promise<string[]> {
    const channels = await this.prisma.channel.findMany({
      where: { isActive: true, contents: { some: { status: 'ACTIVE' } } },
      select: { id: true },
    });
    return channels.map((c) => c.id);
  }

  async getRecentSnapshots(channelId: string): Promise<SessionSnapshot[]> {
    const raw = await this.redis.lrange(`castify:snapshots:${channelId}`, 0, -1);
    return raw
      .map((s) => { try { return JSON.parse(s) as SessionSnapshot; } catch { return null; } })
      .filter((s): s is SessionSnapshot => s !== null);
  }

  async publishNetworkConfig(channelId: string, config: NetworkConfig): Promise<void> {
    await this.redis.setex(`castify:config:${channelId}`, 300, JSON.stringify(config));
  }
}
