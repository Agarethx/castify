import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { NetworkConfig, SessionSnapshot } from '@castify/types';
import { StreamingService } from './streaming.service';

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)] ?? 0;
}

function groupBy<T>(items: T[], key: (item: T) => string | number): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(key(item));
    acc[k] ??= [];
    acc[k]!.push(item);
    return acc;
  }, {});
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class NetworkIntelligenceService {
  private readonly logger = new Logger(NetworkIntelligenceService.name);

  constructor(private readonly streaming: StreamingService) {}

  /** Corre cada 5 minutos — calcula y publica configuración optimizada */
  @Interval(5 * 60 * 1000)
  async computeAndPublish(): Promise<void> {
    const channelIds = await this.streaming.getActiveChannelIds();

    for (const channelId of channelIds) {
      const snapshots = await this.streaming.getRecentSnapshots(channelId);

      if (snapshots.length < 10) {
        this.logger.debug(`Channel ${channelId}: not enough snapshots (${snapshots.length}), skipping`);
        continue;
      }

      const config = this.computeConfig(channelId, snapshots);
      await this.streaming.publishNetworkConfig(channelId, config);
      this.logger.log(
        `NIS → channel ${channelId}: buffer=${config.minBufferToUsePeerSec}s ` +
        `latency=${config.maxPeerLatencyMs}ms offload=${config.avgNetworkOffloadPct.toFixed(1)}%`,
      );
    }
  }

  private computeConfig(channelId: string, snapshots: SessionSnapshot[]): NetworkConfig {
    // ── minBufferToUsePeerSec ─────────────────────────────────────────────────
    // Si hay muchos bufferingEvents recientes, ser más conservador
    const avgBufferingEvents = mean(snapshots.map((s) => s.bufferingEvents));
    const minBufferToUsePeerSec = avgBufferingEvents > 0.5 ? 12 : 8;

    // ── maxPeerLatencyMs ──────────────────────────────────────────────────────
    // Percentil 80 de latencias observadas
    const latencies = snapshots
      .filter((s) => s.avgPeerLatencyMs > 0)
      .map((s) => s.avgPeerLatencyMs)
      .sort((a, b) => a - b);
    const maxPeerLatencyMs = latencies.length > 0 ? percentile(latencies, 80) : 800;

    // ── avgNetworkOffloadPct ──────────────────────────────────────────────────
    const offloads = snapshots.filter((s) => s.p2pOffloadPct > 0).map((s) => s.p2pOffloadPct);
    const avgNetworkOffloadPct = offloads.length > 0 ? mean(offloads) : 0;

    // ── peakHours ─────────────────────────────────────────────────────────────
    // Top 3 horas UTC con más peers conectados
    const peersByHour = groupBy(snapshots, (s) => new Date(s.timestamp).getUTCHours());
    const peakHours = Object.entries(peersByHour)
      .sort(([, a], [, b]) => mean(b.map((s) => s.peersConnected)) - mean(a.map((s) => s.peersConnected)))
      .slice(0, 3)
      .map(([hour]) => parseInt(hour, 10));

    return {
      channelId,
      updatedAt: Date.now(),
      minBufferToUsePeerSec,
      maxPeerLatencyMs,
      peerScoreThreshold: 0.3,
      topIspsByOffload: [],   // fase 2 — requiere datos ISP del viewer
      peakHours,
      avgNetworkOffloadPct,
    };
  }
}
