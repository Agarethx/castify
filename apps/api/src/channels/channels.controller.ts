import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ChannelWithContents, PublicChannel } from '@castify/types';
import { CreateChannelSchema, CreateContentSchema } from '@castify/validators';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator';
import { Channel } from '@castify/types';
import { ChannelsService } from './channels.service';
import { Content } from '@prisma/client';

@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  // ── /api/channels/me ───────────────────────────────────────────────────────

  @UseGuards(TenantGuard)
  @Get('channels/me')
  getMyChannel(@CurrentTenant() tenant: Channel): Promise<ChannelWithContents> {
    return this.channelsService.getMyChannel(tenant.id);
  }

  @UseGuards(TenantGuard)
  @Get('channels/me/content')
  getMyContents(@CurrentTenant() tenant: Channel): Promise<Content[]> {
    return this.channelsService.getMyContents(tenant.id);
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('channels/me/content')
  createContent(
    @CurrentTenant() tenant: Channel,
    @Body() body: unknown,
  ): Promise<Content> {
    const dto = CreateContentSchema.parse(body);
    return this.channelsService.createContent(tenant.id, dto);
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Delete('channels/me/content/:id')
  deleteContent(
    @CurrentTenant() tenant: Channel,
    @Param('id') id: string,
  ): Promise<void> {
    return this.channelsService.deleteContent(tenant.id, id);
  }

  // ── /api/public/channels/:slug ─────────────────────────────────────────────

  @Public()
  @Get('public/channels/:slug')
  async getPublicChannel(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicChannel> {
    reply.header('Cache-Control', 'public, max-age=30');
    return this.channelsService.getPublicChannel(slug);
  }

  // ── /api/admin/channels ────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('admin/channels')
  adminCreateChannel(@Body() body: unknown) {
    const dto = CreateChannelSchema.parse(body);
    return this.channelsService.adminCreateChannel(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('admin/channels')
  adminListChannels(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.channelsService.adminListChannels(
      Math.max(1, parseInt(page, 10)),
      Math.min(100, parseInt(limit, 10)),
    );
  }
}
