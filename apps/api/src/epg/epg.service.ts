import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateEPGEntryDto {
  title: string
  description?: string
  contentId?: string
  startTime: string | Date
  endTime: string | Date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

@Injectable()
export class EpgService {
  constructor(private readonly prisma: PrismaService) {}

  async create(channelId: string, dto: CreateEPGEntryDto) {
    const startTime = new Date(dto.startTime)
    const endTime   = new Date(dto.endTime)

    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime')
    }

    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60_000)

    // Verify contentId belongs to this channel when provided
    if (dto.contentId) {
      const content = await this.prisma.content.findFirst({
        where: { id: dto.contentId, channelId },
        select: { id: true },
      })
      if (!content) throw new NotFoundException('Content not found in this channel')
    }

    return this.prisma.ePGEntry.create({
      data: {
        channelId,
        title: dto.title,
        description: dto.description,
        contentId: dto.contentId ?? null,
        startTime,
        endTime,
        duration,
        metadata: dto.metadata ?? undefined,
      },
      include: {
        content: { select: { title: true, hlsUrl: true } },
      },
    })
  }

  async getNext24h(channelId: string) {
    const now      = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    return this.prisma.ePGEntry.findMany({
      where: {
        channelId,
        startTime: { gte: now },
        endTime:   { lte: tomorrow },
      },
      orderBy: { startTime: 'asc' },
      include: {
        content: { select: { title: true, hlsUrl: true } },
      },
    })
  }

  async update(channelId: string, epgId: string, dto: Partial<CreateEPGEntryDto>) {
    await this.findOwned(channelId, epgId)

    const startTime = dto.startTime ? new Date(dto.startTime) : undefined
    const endTime   = dto.endTime   ? new Date(dto.endTime)   : undefined

    if (startTime && endTime && endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime')
    }

    const duration =
      startTime && endTime
        ? Math.round((endTime.getTime() - startTime.getTime()) / 60_000)
        : undefined

    return this.prisma.ePGEntry.update({
      where: { id: epgId },
      data: {
        ...(dto.title       !== undefined && { title:       dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.contentId   !== undefined && { contentId:   dto.contentId }),
        ...(dto.metadata    !== undefined && { metadata:    dto.metadata }),
        ...(startTime && { startTime }),
        ...(endTime   && { endTime }),
        ...(duration  !== undefined && { duration }),
      },
      include: {
        content: { select: { title: true, hlsUrl: true } },
      },
    })
  }

  async delete(channelId: string, epgId: string): Promise<void> {
    await this.findOwned(channelId, epgId)
    await this.prisma.ePGEntry.delete({ where: { id: epgId } })
  }

  private async findOwned(channelId: string, epgId: string) {
    const entry = await this.prisma.ePGEntry.findFirst({
      where: { id: epgId, channelId },
      select: { id: true },
    })
    if (!entry) throw new NotFoundException('EPG entry not found')
    return entry
  }
}
