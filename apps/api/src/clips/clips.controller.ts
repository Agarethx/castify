import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Channel } from '@castify/types'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import { ClipsService, CreateClipDto } from './clips.service'

@Controller('channels/me/clips')
@UseGuards(TenantGuard, RolesGuard)
@Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  // GET /api/channels/me/clips?contentId=xxx
  @Get()
  list(
    @CurrentTenant() tenant: Channel,
    @Query('contentId') contentId?: string,
  ) {
    return this.clipsService.list(tenant.id, contentId)
  }

  // GET /api/channels/me/clips/:clipId
  @Get(':clipId')
  getOne(
    @CurrentTenant() tenant: Channel,
    @Param('clipId') clipId: string,
  ) {
    return this.clipsService.getOne(tenant.id, clipId)
  }

  // POST /api/channels/me/clips
  @Post()
  create(
    @CurrentTenant() tenant: Channel,
    @Body() body: CreateClipDto,
  ) {
    return this.clipsService.create(tenant.id, body)
  }

  // POST /api/channels/me/clips/:clipId/publish
  @Post(':clipId/publish')
  publish(
    @CurrentTenant() tenant: Channel,
    @Param('clipId') clipId: string,
    @Body('platforms') platforms: string[],
  ) {
    return this.clipsService.publish(tenant.id, clipId, platforms)
  }

  // DELETE /api/channels/me/clips/:clipId
  @Delete(':clipId')
  @HttpCode(204)
  async delete(
    @CurrentTenant() tenant: Channel,
    @Param('clipId') clipId: string,
  ): Promise<void> {
    await this.clipsService.delete(tenant.id, clipId)
  }
}
