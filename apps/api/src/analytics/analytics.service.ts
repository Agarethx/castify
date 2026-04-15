import { Injectable, NotFoundException } from '@nestjs/common'
import type { SessionSnapshot } from '@castify/types'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

// Window used to decide "is this viewer still active?"
const ACTIVE_VIEWER_WINDOW_MS = 30_000

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Live ──────────────────────────────────────────────────────────────────

  async getLiveAnalytics(channelId: string, contentId: string) {
    await this.assertContentOwnership(channelId, contentId)

    const snapshots = await this.getContentSnapshots(channelId, contentId)
    if (snapshots.length === 0) {
      return this.emptyLive()
    }

    const now    = Date.now()
    const active = snapshots.filter(
      (s) => s.status === 'playing' && now - s.timestamp <= ACTIVE_VIEWER_WINDOW_MS,
    )

    // Deduplicate by sessionId — keep latest snapshot per viewer
    const bySession = this.latestPerSession(active)
    const viewers   = bySession.length

    const avgP2pPct    = avg(bySession.map((s) => s.p2pOffloadPct))
    const sumP2pBytes  = sum(bySession.map((s) => s.bytesFromPeers))
    const sumCdnBytes  = sum(bySession.map((s) => s.bytesFromCdn))
    const avgLatencyMs = avg(bySession.map((s) => s.avgPeerLatencyMs).filter((v) => v > 0))
    const avgBuffering = avg(bySession.map((s) => s.bufferingEvents))

    // Most common quality height
    const qualities    = bySession.map((s) => s.qualityHeight).filter((h) => h > 0)
    const qualityLabel = qualities.length > 0 ? `${mode(qualities)}p` : 'auto'

    const cdnGB = sumCdnBytes / 1073741824  // bytes → GB
    const p2pGB = sumP2pBytes / 1073741824

    return {
      viewers,
      p2pOffloadPct:    +avgP2pPct.toFixed(1),
      cdnBandwidthGB:   +cdnGB.toFixed(4),
      p2pBandwidthGB:   +p2pGB.toFixed(4),
      estimatedSavings: +(p2pGB * 0.15).toFixed(2),
      quality:          qualityLabel,
      avgLatencyMs:     Math.round(avgLatencyMs),
      bufferingEventsPerViewer: +avgBuffering.toFixed(2),
    }
  }

  // ── Retention ─────────────────────────────────────────────────────────────

  async getRetention(channelId: string, contentId: string) {
    await this.assertContentOwnership(channelId, contentId)

    const snapshots = await this.getContentSnapshots(channelId, contentId)
    if (snapshots.length === 0) return []

    // Group snapshots by minute bucket
    const byMinute = new Map<number, SessionSnapshot[]>()
    for (const s of snapshots) {
      const minute = Math.floor(s.timestamp / 60_000)
      const bucket = byMinute.get(minute) ?? []
      bucket.push(s)
      byMinute.set(minute, bucket)
    }

    // For each minute, count unique viewers that were playing
    const retention: { minute: number; viewers: number }[] = []
    for (const [minute, snaps] of byMinute) {
      const playing  = snaps.filter((s) => s.status === 'playing')
      const uniqueIds = new Set(playing.map((s) => s.sessionId))
      retention.push({ minute, viewers: uniqueIds.size })
    }

    return retention.sort((a, b) => a.minute - b.minute)
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  async getSummary(channelId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true, title: true, durationSec: true },
    })
    if (!content) throw new NotFoundException('Content not found')

    const snapshots = await this.getContentSnapshots(channelId, contentId)
    if (snapshots.length === 0) {
      return {
        title: content.title,
        durationSec: content.durationSec,
        peakViewers: 0,
        averageViewers: 0,
        totalP2PBandwidthGB: 0,
        totalCDNBandwidthGB: 0,
        avgP2POffloadPct: '0.0',
        estimatedSavingsUSD: '0.00',
        snapshotCount: 0,
      }
    }

    // Bucket unique viewers per minute to find peak
    const byMinute = new Map<number, Set<string>>()
    for (const s of snapshots) {
      if (s.status !== 'playing') continue
      const minute  = Math.floor(s.timestamp / 60_000)
      const viewers = byMinute.get(minute) ?? new Set<string>()
      viewers.add(s.sessionId)
      byMinute.set(minute, viewers)
    }

    const viewerCountsPerMinute = [...byMinute.values()].map((s) => s.size)
    const peakViewers    = viewerCountsPerMinute.length > 0 ? Math.max(...viewerCountsPerMinute) : 0
    const averageViewers = viewerCountsPerMinute.length > 0
      ? Math.round(sum(viewerCountsPerMinute) / viewerCountsPerMinute.length)
      : 0

    // Aggregate bandwidth from latest snapshot per session (cumulative totals)
    const latest     = this.latestPerSession(snapshots)
    const totalP2P   = sum(latest.map((s) => s.bytesFromPeers))
    const totalCDN   = sum(latest.map((s) => s.bytesFromCdn))
    const avgOffload = avg(latest.map((s) => s.p2pOffloadPct))

    const p2pGB = totalP2P / 1073741824
    const cdnGB = totalCDN / 1073741824

    return {
      title: content.title,
      durationSec: content.durationSec,
      peakViewers,
      averageViewers,
      totalP2PBandwidthGB:  +p2pGB.toFixed(4),
      totalCDNBandwidthGB:  +cdnGB.toFixed(4),
      avgP2POffloadPct:     avgOffload.toFixed(1),
      estimatedSavingsUSD:  (p2pGB * 0.15).toFixed(2),
      snapshotCount: snapshots.length,
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async assertContentOwnership(channelId: string, contentId: string) {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
      select: { id: true },
    })
    if (!content) throw new NotFoundException('Content not found')
  }

  private async getContentSnapshots(
    channelId: string,
    contentId: string,
  ): Promise<SessionSnapshot[]> {
    const raw = await this.redis.lrange(`castify:snapshots:${channelId}`, 0, -1)
    return raw
      .flatMap((s) => { try { return [JSON.parse(s) as SessionSnapshot] } catch { return [] } })
      .filter((s) => s.contentId === contentId)
  }

  private latestPerSession(snapshots: SessionSnapshot[]): SessionSnapshot[] {
    const bySession = new Map<string, SessionSnapshot>()
    for (const s of snapshots) {
      const prev = bySession.get(s.sessionId)
      if (!prev || s.timestamp > prev.timestamp) {
        bySession.set(s.sessionId, s)
      }
    }
    return [...bySession.values()]
  }

  private emptyLive() {
    return {
      viewers: 0,
      p2pOffloadPct: 0,
      cdnBandwidthGB: 0,
      p2pBandwidthGB: 0,
      estimatedSavings: 0,
      quality: 'auto',
      avgLatencyMs: 0,
      bufferingEventsPerViewer: 0,
    }
  }
}

// ── Math utils ─────────────────────────────────────────────────────────────────

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

function mode(values: number[]): number {
  const freq = new Map<number, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  let best = values[0] ?? 0
  let bestCount = 0
  for (const [v, count] of freq) {
    if (count > bestCount) { best = v; bestCount = count }
  }
  return best
}
