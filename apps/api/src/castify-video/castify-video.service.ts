import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { createHmac, randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

export type SessionMode = '1to1' | 'group'

export interface CreateVideoSessionDto {
  title: string
  mode: SessionMode
  /** Optional password for 1-to-1 access control */
  password?: string
  webhookUrl?: string
}

export interface TrackBandwidthDto {
  /** Incremental GB transferred in this interval */
  gbDelta: number
}

// Pricing constants
const RATE_1TO1 = 0.04635   // CDN-only  (Bunny $0.045 + 3% margin)
const RATE_GROUP = 0.015    // P2P hybrid
const MONTHLY_BASE_FEE = 50 // USD/month flat
const MAX_CONCURRENT = 20
const MONTHLY_GB_CAP = 1_000
const ALERT_THRESHOLD = 0.80 // 80%

@Injectable()
export class CastifyVideoService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────────────────

  async createSession(channelId: string, dto: CreateVideoSessionDto) {
    await this.checkLimits(channelId)

    const deliveryMode = dto.mode === '1to1' ? 'cdn' : 'hybrid'
    const ratePerGb = dto.mode === '1to1' ? RATE_1TO1 : RATE_GROUP

    const streamKey = randomUUID()
    const password = dto.password ?? (dto.mode === '1to1' ? this.generatePassword() : undefined)
    const webhookSecret = randomBytes(32).toString('hex')

    const session = await this.prisma.castifyVideoSession.create({
      data: {
        channelId,
        title: dto.title,
        mode: dto.mode,
        deliveryMode,
        streamKey,
        password: password ?? null,
        ratePerGb,
        webhookUrl: dto.webhookUrl ?? null,
        webhookSecret,
        status: 'created',
      },
    })

    if (dto.webhookUrl) {
      await this.sendWebhook(dto.webhookUrl, webhookSecret, {
        type: 'session.created',
        sessionId: session.id,
        mode: dto.mode,
        deliveryMode,
        expectedRate: ratePerGb,
      })
    }

    return {
      id: session.id,
      streamKey,
      password,
      deliveryMode,
      expectedRate: ratePerGb,
      status: 'created',
    }
  }

  // ── Access validation (viewers) ───────────────────────────────────────────

  async validateAccess(sessionId: string, password?: string) {
    const session = await this.findSession(sessionId)

    if (session.status !== 'active') {
      throw new ForbiddenException('Session is not active')
    }

    // 1-to-1 sessions are password-protected
    if (session.mode === '1to1') {
      if (!password || session.password !== password) {
        throw new ForbiddenException('Invalid password')
      }
    }

    return {
      valid: true,
      streamKey: session.streamKey,
      deliveryMode: session.deliveryMode,
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async startSession(channelId: string, sessionId: string): Promise<void> {
    const session = await this.findOwned(channelId, sessionId)

    if (session.status !== 'created') {
      throw new BadRequestException('Session already started or ended')
    }

    await this.prisma.castifyVideoSession.update({
      where: { id: sessionId },
      data: { status: 'active', startedAt: new Date() },
    })

    await this.fireWebhook(session, 'session.started')
  }

  async endSession(channelId: string, sessionId: string): Promise<void> {
    const session = await this.findOwned(channelId, sessionId)

    if (session.status === 'ended') return

    const endedAt = new Date()
    const totalCost = session.bandwidthGb * session.ratePerGb

    await this.prisma.castifyVideoSession.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt, totalCost },
    })

    // Update / create monthly bill
    await this.accrueToBilling(session.channelId, session.mode, session.bandwidthGb, totalCost)

    await this.fireWebhook(session, 'session.ended', {
      bandwidthGb: session.bandwidthGb,
      totalCost,
    })
  }

  // ── Bandwidth tracking ────────────────────────────────────────────────────

  async trackBandwidth(channelId: string, sessionId: string, dto: TrackBandwidthDto) {
    const session = await this.findOwned(channelId, sessionId)

    if (session.status !== 'active') {
      throw new BadRequestException('Cannot track bandwidth on a non-active session')
    }

    const newGb = session.bandwidthGb + dto.gbDelta
    await this.prisma.castifyVideoSession.update({
      where: { id: sessionId },
      data: { bandwidthGb: newGb },
    })

    return { bandwidthGb: newGb, estimatedCost: newGb * session.ratePerGb }
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getSessionAnalytics(channelId: string, sessionId: string) {
    const session = await this.findOwned(channelId, sessionId)

    return {
      id: session.id,
      title: session.title,
      mode: session.mode,
      deliveryMode: session.deliveryMode,
      status: session.status,
      bandwidthGb: session.bandwidthGb,
      ratePerGb: session.ratePerGb,
      estimatedCost: session.bandwidthGb * session.ratePerGb,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    }
  }

  // ── Monthly billing ───────────────────────────────────────────────────────

  async generateMonthlyBill(channelId: string, month: number, year: number) {
    const existing = await this.prisma.castifyVideoBilling.findUnique({
      where: { channelId_month_year: { channelId, month, year } },
      include: { sessions: true },
    })

    if (existing) return existing

    // Aggregate from ended sessions in this month
    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)

    const sessions = await this.prisma.castifyVideoSession.findMany({
      where: {
        channelId,
        status: 'ended',
        endedAt: { gte: from, lt: to },
      },
    })

    const cdn1to1 = sessions.filter(s => s.mode === '1to1')
    const hybrid = sessions.filter(s => s.mode === 'group')

    const cdn1to1Gb = cdn1to1.reduce((acc, s) => acc + s.bandwidthGb, 0)
    const hybridGb = hybrid.reduce((acc, s) => acc + s.bandwidthGb, 0)
    const cdn1to1Cost = cdn1to1Gb * RATE_1TO1
    const hybridCost = hybridGb * RATE_GROUP
    const totalCost = MONTHLY_BASE_FEE + cdn1to1Cost + hybridCost

    const billing = await this.prisma.castifyVideoBilling.create({
      data: {
        channelId,
        month,
        year,
        cdn1to1Gb,
        hybridGb,
        cdn1to1Cost,
        hybridCost,
        baseFee: MONTHLY_BASE_FEE,
        totalCost,
        sessionCount: sessions.length,
      },
    })

    // Link sessions to this billing record
    if (sessions.length > 0) {
      await this.prisma.castifyVideoSession.updateMany({
        where: { id: { in: sessions.map(s => s.id) } },
        data: { billingId: billing.id },
      })
    }

    return billing
  }

  async getBillingHistory(channelId: string) {
    return this.prisma.castifyVideoBilling.findMany({
      where: { channelId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
  }

  async getCurrentMonthUsage(channelId: string) {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const from = new Date(year, month - 1, 1)
    const to = new Date(year, month, 1)

    const sessions = await this.prisma.castifyVideoSession.findMany({
      where: {
        channelId,
        createdAt: { gte: from, lt: to },
        status: { in: ['active', 'ended'] },
      },
    })

    const cdn1to1Gb = sessions.filter(s => s.mode === '1to1').reduce((a, s) => a + s.bandwidthGb, 0)
    const hybridGb = sessions.filter(s => s.mode === 'group').reduce((a, s) => a + s.bandwidthGb, 0)
    const totalGb = cdn1to1Gb + hybridGb

    const cdn1to1Cost = cdn1to1Gb * RATE_1TO1
    const hybridCost = hybridGb * RATE_GROUP
    const estimatedTotal = MONTHLY_BASE_FEE + cdn1to1Cost + hybridCost

    const capPct = totalGb / MONTHLY_GB_CAP
    const nearCap = capPct >= ALERT_THRESHOLD
    const concurrentActive = sessions.filter(s => s.status === 'active').length

    return {
      month,
      year,
      cdn1to1Gb,
      hybridGb,
      totalGb,
      capGb: MONTHLY_GB_CAP,
      capPct,
      nearCap,
      cdn1to1Cost,
      hybridCost,
      baseFee: MONTHLY_BASE_FEE,
      estimatedTotal,
      concurrentActive,
      maxConcurrent: MAX_CONCURRENT,
      sessionCount: sessions.length,
    }
  }

  // ── List sessions ─────────────────────────────────────────────────────────

  async listSessions(channelId: string, status?: string) {
    return this.prisma.castifyVideoSession.findMany({
      where: {
        channelId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── Limit guard ───────────────────────────────────────────────────────────

  async checkLimits(channelId: string) {
    const concurrent = await this.prisma.castifyVideoSession.count({
      where: { channelId, status: 'active' },
    })

    if (concurrent >= MAX_CONCURRENT) {
      throw new BadRequestException(`Max ${MAX_CONCURRENT} concurrent sessions reached`)
    }

    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)

    const monthSessions = await this.prisma.castifyVideoSession.findMany({
      where: { channelId, createdAt: { gte: from } },
      select: { bandwidthGb: true },
    })

    const usedGb = monthSessions.reduce((a, s) => a + s.bandwidthGb, 0)
    if (usedGb >= MONTHLY_GB_CAP) {
      throw new BadRequestException('Monthly bandwidth cap reached')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findSession(sessionId: string) {
    const session = await this.prisma.castifyVideoSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new NotFoundException('Session not found')
    return session
  }

  private async findOwned(channelId: string, sessionId: string) {
    const session = await this.findSession(sessionId)
    if (session.channelId !== channelId) throw new ForbiddenException('Access denied')
    return session
  }

  private async accrueToBilling(
    channelId: string,
    mode: string,
    bandwidthGb: number,
    sessionCost: number,
  ): Promise<void> {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const is1to1 = mode === '1to1'

    await this.prisma.castifyVideoBilling.upsert({
      where: { channelId_month_year: { channelId, month, year } },
      create: {
        channelId,
        month,
        year,
        cdn1to1Gb: is1to1 ? bandwidthGb : 0,
        hybridGb: is1to1 ? 0 : bandwidthGb,
        cdn1to1Cost: is1to1 ? sessionCost : 0,
        hybridCost: is1to1 ? 0 : sessionCost,
        baseFee: MONTHLY_BASE_FEE,
        totalCost: MONTHLY_BASE_FEE + sessionCost,
        sessionCount: 1,
      },
      update: {
        cdn1to1Gb: is1to1 ? { increment: bandwidthGb } : undefined,
        hybridGb: is1to1 ? undefined : { increment: bandwidthGb },
        cdn1to1Cost: is1to1 ? { increment: sessionCost } : undefined,
        hybridCost: is1to1 ? undefined : { increment: sessionCost },
        totalCost: { increment: sessionCost },
        sessionCount: { increment: 1 },
      },
    })
  }

  private async fireWebhook(
    session: { id: string; webhookUrl: string | null; webhookSecret: string | null },
    event: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    if (!session.webhookUrl || !session.webhookSecret) return
    await this.sendWebhook(session.webhookUrl, session.webhookSecret, {
      type: event,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  }

  private async sendWebhook(
    url: string,
    secret: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const body = JSON.stringify(payload)
      const signature = createHmac('sha256', secret).update(body).digest('hex')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Castify-Signature': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[CastifyVideo] Webhook failed ${url}: ${msg}`)
    }
  }

  private generatePassword(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase()
  }
}
