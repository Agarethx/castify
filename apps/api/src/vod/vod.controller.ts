import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Param,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator';
import { Channel } from '@castify/types';
import { VodService } from './vod.service';
import { Vod2LiveService } from './vod2live.service';
import { LiveClipsService } from './live-clips.service';

const ALLOWED_MIMETYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/avi',
]);

// Extend Fastify request with the multipart file() method added by @fastify/multipart
type MultipartRequest = FastifyRequest & {
  file: () => Promise<MultipartFile | undefined>;
};

@Controller('channels/me/vod')
export class VodController {
  constructor(
    private readonly vodService: VodService,
    private readonly vod2liveService: Vod2LiveService,
    private readonly liveClipsService: LiveClipsService,
  ) {}

  // POST /api/channels/me/vod/upload
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('upload')
  async uploadVod(
    @CurrentTenant() tenant: Channel,
    @Req() req: MultipartRequest,
  ): Promise<{ contentId: string; status: string }> {
    const data = await req.file();

    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    if (!ALLOWED_MIMETYPES.has(data.mimetype)) {
      throw new BadRequestException(
        'Tipo de archivo no soportado. Use MP4, MOV o AVI.',
      );
    }

    return this.vodService.uploadAndProcess(tenant.id, data);
  }

  // GET /api/channels/me/vod/status/:contentId
  @UseGuards(TenantGuard)
  @Get('status/:contentId')
  getVodStatus(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.vodService.getVodStatus(tenant.id, contentId);
  }

  // POST /api/channels/me/vod/:contentId/vod2live/start
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post(':contentId/vod2live/start')
  startVOD2Live(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
    @Body() body: { startSeconds?: number; endSeconds?: number; goLiveAt?: string },
  ) {
    return this.vod2liveService.startVOD2Live({
      contentId,
      channelId: tenant.id,
      startSeconds: body.startSeconds,
      endSeconds: body.endSeconds,
      goLiveAt: body.goLiveAt ? new Date(body.goLiveAt) : undefined,
    });
  }

  // POST /api/channels/me/vod/:contentId/vod2live/stop
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post(':contentId/vod2live/stop')
  @HttpCode(204)
  async stopVOD2Live(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ): Promise<void> {
    await this.vod2liveService.stopVOD2Live(contentId, tenant.id);
  }

  // POST /api/channels/me/vod/:contentId/clips
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post(':contentId/clips')
  createClip(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
    @Body() body: { duration?: number },
  ) {
    return this.liveClipsService.createClip(
      contentId,
      tenant.id,
      body.duration ?? 30,
    );
  }

  // GET /api/channels/me/vod/:contentId/clips
  @UseGuards(TenantGuard)
  @Get(':contentId/clips')
  listClips(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.liveClipsService.listClips(contentId, tenant.id);
  }
}
