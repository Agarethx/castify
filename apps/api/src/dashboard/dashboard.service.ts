import { Injectable } from '@nestjs/common'
import type { SessionSnapshot } from '@castify/types'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE'

const BANDWIDTH_CAP_GB: Record<Plan, number> = {
  STARTER: 100,
  PRO: 500,
  ENTERPRISE: 10_000,
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSummary(channelId: string) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // ── Parallel DB queries ─────────────────────────────────────────────────
    const [
      channel,
      totalContents,
      liveStreams,
      vodContents,
      activePrivateSessions,
      monthlyStreamSessions,
      videoSessions,
      multistreamActive,
    ] = await Promise.all([
      this.prisma.channel.findUniqueOrThrow({ where: { id: channelId } }),
      this.prisma.content.count({ where: { channelId } }),
      this.prisma.content.count({ where: { channelId, status: 'ACTIVE' } }),
      this.prisma.content.count({ where: { channelId, type: 'VOD' } }),
      this.prisma.privateSession.count({ where: { channelId, status: 'active' } }),
      this.prisma.streamSession.findMany({
        where: {
          content: { channelId },
          startedAt: { gte: monthStart },
        },
        select: { bytesFromCdn: true, bytesFromPeers: true },
      }),
      this.prisma.castifyVideoSession.findMany({
        where: { channelId, createdAt: { gte: monthStart } },
        select: { bandwidthGb: true, ratePerGb: true, status: true, mode: true },
      }),
      this.prisma.content.count({
        where: { channelId, status: 'ACTIVE' },
      }),
    ])

    const plan = channel.plan as Plan

    // ── Bandwidth from stream sessions (CDN + P2P) ──────────────────────────
    let cdnBytes = 0n
    let p2pBytes = 0n
    for (const s of monthlyStreamSessions) {
      cdnBytes += s.bytesFromCdn
      p2pBytes += s.bytesFromPeers
    }
    const cdnGb = Number(cdnBytes) / 1_073_741_824
    const p2pGb = Number(p2pBytes) / 1_073_741_824
    const totalStreamGb = cdnGb + p2pGb
    const p2pOffloadPct = totalStreamGb > 0 ? (p2pGb / totalStreamGb) * 100 : 0
    const bandwidthCapGb = BANDWIDTH_CAP_GB[plan]

    // ── Live viewer count from Redis snapshots ──────────────────────────────
    const { viewers: currentViewers, avgP2p } = await this.getLiveViewers(channelId)

    // ── Castify Video aggregates ────────────────────────────────────────────
    const activeVideoSessions = videoSessions.filter(s => s.status === 'active').length
    const videoGbUsed = videoSessions.reduce((acc, s) => acc + s.bandwidthGb, 0)
    const videoGbCap = 1_000
    const videoCapPct = videoGbUsed / videoGbCap
    const videoEstimatedCost = videoSessions.reduce(
      (acc, s) => acc + s.bandwidthGb * s.ratePerGb, 0,
    )
    const hasVideoSessions = videoSessions.length > 0

    return {
      plan,
      stats: {
        totalContents,
        liveStreams,
        vodContents,
        activePrivateSessions,
        // Bandwidth
        bandwidthGbUsed: +totalStreamGb.toFixed(3),
        cdnGbUsed: +cdnGb.toFixed(3),
        p2pGbUsed: +p2pGb.toFixed(3),
        bandwidthCapGb,
        bandwidthCapPct: +(totalStreamGb / bandwidthCapGb).toFixed(4),
        // Live
        currentViewers,
        p2pOffloadPct: +p2pOffloadPct.toFixed(1),
        avgP2pOffloadPct: +avgP2p.toFixed(1),
        estimatedSavingsUsd: +(p2pGb * 0.15).toFixed(2),
        // Multistream
        multistreamActive,
      },
      castifyVideo: hasVideoSessions
        ? {
            activeSessions: activeVideoSessions,
            monthlyGbUsed: +videoGbUsed.toFixed(3),
            bandwidthCapGb: videoGbCap,
            capPct: +videoCapPct.toFixed(4),
            nearCap: videoCapPct >= 0.8,
            estimatedCostUsd: +videoEstimatedCost.toFixed(2),
            baseFee: 50,
            totalEstimate: +(videoEstimatedCost + 50).toFixed(2),
          }
        : null,
    }
  }

  private async getLiveViewers(
    channelId: string,
  ): Promise<{ viewers: number; avgP2p: number }> {
    try {
      const raw = await this.redis.lrange(`castify:snapshots:${channelId}`, 0, -1)
      const snapshots = raw.flatMap<SessionSnapshot>(s => {
        try { return [JSON.parse(s) as SessionSnapshot] } catch { return [] }
      })

      const now = Date.now()
      const active = snapshots.filter(
        s => s.status === 'playing' && now - s.timestamp <= 30_000,
      )

      // Deduplicate by sessionId
      const bySession = new Map<string, SessionSnapshot>()
      for (const s of active) {
        const prev = bySession.get(s.sessionId)
        if (!prev || s.timestamp > prev.timestamp) bySession.set(s.sessionId, s)
      }

      const list = [...bySession.values()]
      const viewers = list.length
      const avgP2p =
        viewers === 0
          ? 0
          : list.reduce((acc, s) => acc + s.p2pOffloadPct, 0) / viewers

      return { viewers, avgP2p }
    } catch {
      return { viewers: 0, avgP2p: 0 }
    }
  }
}
