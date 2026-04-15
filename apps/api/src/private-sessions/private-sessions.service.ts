import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { createHmac, randomBytes, randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateSessionDto {
  title: string
  description?: string
  duration: number
  maxIdleTime?: number
  scheduledAt?: Date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
  webhookUrl?: string
}

export interface SessionResponse {
  sessionId: string
  roomUrl: string
  password: string
  streamKey: string
  expiresAt: Date
  status: string
}

@Injectable()
export class PrivateSessionsService {
  constructor(private prisma: PrismaService) {}

  async createSession(channelId: string, dto: CreateSessionDto): Promise<SessionResponse> {
    const activeCount = await this.prisma.privateSession.count({
      where: { channelId, status: { in: ['scheduled', 'active'] } },
    })

    if (activeCount >= 100) {
      throw new BadRequestException('Max concurrent sessions reached')
    }

    const streamKey = `sess_${randomUUID()}`
    const password = this.generatePassword()
    const sessionId = randomUUID()
    const webhookSecret = randomBytes(32).toString('hex')
    const maxIdleTime = dto.maxIdleTime ?? 10

    const expiresAt = new Date(Date.now() + (dto.duration + maxIdleTime) * 60 * 1000)

    await this.prisma.privateSession.create({
      data: {
        id: sessionId,
        channelId,
        title: dto.title,
        description: dto.description,
        streamKey,
        password,
        duration: dto.duration,
        maxIdleTime,
        scheduledAt: dto.scheduledAt,
        status: 'scheduled',
        metadata: dto.metadata ?? {},
        webhookUrl: dto.webhookUrl,
        webhookSecret,
      },
    })

    await this.logEvent(sessionId, 'session.created', undefined, { duration: dto.duration })

    if (dto.webhookUrl) {
      await this.sendWebhook(dto.webhookUrl, webhookSecret, {
        type: 'session.created',
        sessionId,
        title: dto.title,
        createdAt: new Date().toISOString(),
      })
    }

    return {
      sessionId,
      roomUrl: `https://castify.lat/embed/sessions/${sessionId}`,
      password,
      streamKey: `rtmp://castify.lat/live/${streamKey}`,
      expiresAt,
      status: 'scheduled',
    }
  }

  async startSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId)

    if (session.status !== 'scheduled') {
      throw new BadRequestException('Session cannot be started')
    }

    await this.prisma.privateSession.update({
      where: { id: sessionId },
      data: { status: 'active', startedAt: new Date() },
    })

    await this.logEvent(sessionId, 'session.started')
    await this.sendWebhookForSession(session, 'session.started')
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId)

    if (session.status === 'ended') return

    await this.prisma.privateSession.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    })

    await this.logEvent(sessionId, 'session.ended')
    await this.sendWebhookForSession(session, 'session.ended')
  }

  async validatePassword(
    sessionId: string,
    password: string,
  ): Promise<{ valid: false } | { valid: true; streamKey: string; title: string }> {
    const session = await this.getSession(sessionId)

    if (session.status !== 'active' || session.password !== password) {
      return { valid: false }
    }

    return { valid: true, streamKey: session.streamKey, title: session.title }
  }

  async validateStreamKey(
    streamKey: string,
  ): Promise<{ sessionId: string; channelId: string } | null> {
    const session = await this.prisma.privateSession.findUnique({
      where: { streamKey },
      select: { id: true, channelId: true, status: true },
    })

    if (!session || session.status !== 'active') return null

    return { sessionId: session.id, channelId: session.channelId }
  }

  async recordViewer(
    sessionId: string,
    userId?: string,
    userEmail?: string,
  ): Promise<void> {
    const session = await this.getSession(sessionId)

    const recentJoins = await this.prisma.sessionEvent.count({
      where: {
        sessionId,
        type: 'user.joined',
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    })

    if (recentJoins > session.peakViewers) {
      await this.prisma.privateSession.update({
        where: { id: sessionId },
        data: { peakViewers: recentJoins },
      })
    }

    await this.logEvent(sessionId, 'user.joined', userId, { userEmail })
    await this.sendWebhookForSession(session, 'user.joined', { userId, userEmail })
  }

  async recordViewerLeft(sessionId: string, userId?: string): Promise<void> {
    const session = await this.getSession(sessionId)
    await this.logEvent(sessionId, 'user.left', userId)
    await this.sendWebhookForSession(session, 'user.left', { userId })
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.privateSession.findUnique({
      where: { id: sessionId },
    })

    if (!session) throw new NotFoundException('Session not found')

    return session
  }

  async getSessionStats(sessionId: string) {
    const session = await this.getSession(sessionId)
    const events = await this.prisma.sessionEvent.findMany({ where: { sessionId } })

    const joinedCount = events.filter(e => e.type === 'user.joined').length
    const leftCount = events.filter(e => e.type === 'user.left').length

    return {
      sessionId,
      title: session.title,
      status: session.status,
      duration: session.duration,
      peakViewers: session.peakViewers,
      totalViewers: joinedCount,
      currentViewers: joinedCount - leftCount,
      events,
    }
  }

  private async logEvent(
    sessionId: string,
    type: string,
    userId?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.sessionEvent.create({
      data: { sessionId, type, userId, metadata },
    })
  }

  private async sendWebhookForSession(
    session: { id: string; webhookUrl: string | null; webhookSecret: string | null },
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!session.webhookUrl || !session.webhookSecret) return

    await this.sendWebhook(session.webhookUrl, session.webhookSecret, {
      type: eventType,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      ...metadata,
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
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Webhook failed for ${url}: ${message}`)
    }
  }

  private generatePassword(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase()
  }
}
