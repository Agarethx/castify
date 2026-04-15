import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Content } from '@prisma/client';
import { ChannelWithContents, PublicChannel } from '@castify/types';
import { CreateChannelDto, CreateContentDto } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';

const CONTENT_PUBLIC_SELECT = {
  id: true,
  title: true,
  type: true,
  status: true,
  hlsUrl: true,
  durationSec: true,
  createdAt: true,
} as const;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Canal actual del usuario autenticado (via TenantGuard) ─────────────────

  async getMyChannel(channelId: string): Promise<ChannelWithContents> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        contents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!channel) throw new NotFoundException('Canal no encontrado');

    return {
      ...channel,
      contents: channel.contents.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // ── Listar contenidos del canal ───────────────────────────────────────────

  async getMyContents(channelId: string): Promise<Content[]> {
    const contents = await this.prisma.content.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
    });
    return contents.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })) as unknown as Content[];
  }

  // ── Crear contenido ────────────────────────────────────────────────────────

  async createContent(channelId: string, dto: CreateContentDto): Promise<Content> {
    return this.prisma.content.create({
      data: {
        channelId,
        title: dto.title,
        type: dto.type,
        status: 'INACTIVE',
      },
    });
  }

  // ── Eliminar contenido (no permite si está ACTIVE) ─────────────────────────

  async deleteContent(channelId: string, contentId: string): Promise<void> {
    const content = await this.prisma.content.findFirst({
      where: { id: contentId, channelId },
    });

    if (!content) throw new NotFoundException('Contenido no encontrado');
    if (content.status === 'ACTIVE') {
      throw new ConflictException('No se puede eliminar un stream activo');
    }

    await this.prisma.content.delete({ where: { id: contentId } });
  }

  // ── Canal público (sin streamKey) ─────────────────────────────────────────

  async getPublicChannel(slug: string): Promise<PublicChannel> {
    const channel = await this.prisma.channel.findUnique({
      where: { slug },
      include: {
        contents: {
          where: { status: { not: 'INACTIVE' } },
          select: CONTENT_PUBLIC_SELECT,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!channel || !channel.isActive) throw new NotFoundException('Canal no encontrado');

    return {
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      logoUrl: channel.logoUrl,
      primaryColor: channel.primaryColor,
      isActive: channel.isActive,
      contents: channel.contents.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // ── Admin: crear canal ────────────────────────────────────────────────────

  async adminCreateChannel(
    dto: CreateChannelDto,
  ): Promise<{ channel: { id: string; name: string; slug: string }; liveContent: { id: string; streamKey: string } }> {
    const existing = await this.prisma.channel.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`El slug '${dto.slug}' ya está en uso`);

    const channel = await this.prisma.channel.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        plan: dto.plan,
        primaryColor: dto.primaryColor ?? '#000000',
        logoUrl: dto.logoUrl ?? null,
        contents: {
          create: {
            title: 'Señal en vivo',
            type: 'LIVE',
            status: 'INACTIVE',
          },
        },
      },
      include: { contents: true },
    });

    const liveContent = channel.contents[0];
    if (!liveContent) throw new Error('Error creando contenido inicial');

    return {
      channel: { id: channel.id, name: channel.name, slug: channel.slug },
      liveContent: { id: liveContent.id, streamKey: liveContent.streamKey },
    };
  }

  // ── Admin: listar canales ─────────────────────────────────────────────────

  async adminListChannels(
    page: number,
    limit: number,
  ): Promise<{ data: unknown[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [channels, total] = await Promise.all([
      this.prisma.channel.findMany({
        skip,
        take: limit,
        include: {
          contents: {
            where: { type: 'LIVE' },
            select: { id: true, streamKey: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.channel.count(),
    ]);

    return { data: channels, total, page, limit };
  }

  // ── Resolver canal por slug (para TenantService) ───────────────────────────

  async findBySlug(slug: string) {
    const channel = await this.prisma.channel.findUnique({ where: { slug } });
    if (!channel || !channel.isActive) throw new NotFoundException(`Canal '${slug}' no encontrado`);
    return channel;
  }
}
