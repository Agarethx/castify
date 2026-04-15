import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Channel } from '@castify/types'
import { Public } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import { CreateEPGEntryDto, EpgService } from './epg.service'

@Controller('channels/me/epg')
export class EpgController {
  constructor(private readonly epgService: EpgService) {}

  // GET /api/channels/me/epg?date=YYYY-MM-DD
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Get()
  listByDate(
    @CurrentTenant() tenant: Channel,
    @Query('date') date?: string,
  ) {
    const d = date ?? new Date().toISOString().split('T')[0]!
    return this.epgService.listByDate(tenant.id, d)
  }

  // GET /api/channels/me/epg/24h — public; viewers can see the schedule
  @Public()
  @UseGuards(TenantGuard)
  @Get('24h')
  getNext24h(@CurrentTenant() tenant: Channel) {
    return this.epgService.getNext24h(tenant.id)
  }

  // POST /api/channels/me/epg
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post()
  create(
    @CurrentTenant() tenant: Channel,
    @Body() body: unknown,
  ) {
    return this.epgService.create(tenant.id, body as CreateEPGEntryDto)
  }

  // PUT /api/channels/me/epg/:epgId
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Put(':epgId')
  update(
    @CurrentTenant() tenant: Channel,
    @Param('epgId') epgId: string,
    @Body() body: unknown,
  ) {
    return this.epgService.update(tenant.id, epgId, body as Partial<CreateEPGEntryDto>)
  }

  // DELETE /api/channels/me/epg/:epgId
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Delete(':epgId')
  @HttpCode(204)
  async delete(
    @CurrentTenant() tenant: Channel,
    @Param('epgId') epgId: string,
  ): Promise<void> {
    await this.epgService.delete(tenant.id, epgId)
  }
}
