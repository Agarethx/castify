import {
  Controller,
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
  constructor(private readonly vodService: VodService) {}

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
}
