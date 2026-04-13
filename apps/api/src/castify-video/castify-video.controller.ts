import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Channel } from '@castify/types'
import { Public } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import {
  CastifyVideoService,
  CreateVideoSessionDto,
  TrackBandwidthDto,
} from './castify-video.service'

@Controller('castify-video')
export class CastifyVideoController {
  constructor(private readonly videoService: CastifyVideoService) {}

  // ── Session management (channel admins) ───────────────────────────────────

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Get('sessions')
  listSessions(
    @CurrentTenant() tenant: Channel,
    @Query('status') status?: string,
  ) {
    return this.videoService.listSessions(tenant.id, status)
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('sessions')
  createSession(
    @CurrentTenant() tenant: Channel,
    @Body() body: CreateVideoSessionDto,
  ) {
    return this.videoService.createSession(tenant.id, body)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('sessions/:sessionId/start')
  @HttpCode(204)
  async startSession(
    @CurrentTenant() tenant: Channel,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.videoService.startSession(tenant.id, sessionId)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('sessions/:sessionId/end')
  @HttpCode(204)
  async endSession(
    @CurrentTenant() tenant: Channel,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.videoService.endSession(tenant.id, sessionId)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('sessions/:sessionId/bandwidth')
  trackBandwidth(
    @CurrentTenant() tenant: Channel,
    @Param('sessionId') sessionId: string,
    @Body() body: TrackBandwidthDto,
  ) {
    return this.videoService.trackBandwidth(tenant.id, sessionId, body)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Get('sessions/:sessionId/analytics')
  getSessionAnalytics(
    @CurrentTenant() tenant: Channel,
    @Param('sessionId') sessionId: string,
  ) {
    return this.videoService.getSessionAnalytics(tenant.id, sessionId)
  }

  // ── Billing ───────────────────────────────────────────────────────────────

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Get('billing/current')
  getCurrentUsage(@CurrentTenant() tenant: Channel) {
    return this.videoService.getCurrentMonthUsage(tenant.id)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Get('billing/history')
  getBillingHistory(@CurrentTenant() tenant: Channel) {
    return this.videoService.getBillingHistory(tenant.id)
  }

  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post('billing/:year/:month/generate')
  generateMonthlyBill(
    @CurrentTenant() tenant: Channel,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.videoService.generateMonthlyBill(tenant.id, parseInt(month, 10), parseInt(year, 10))
  }

  // ── Public — viewer access validation ────────────────────────────────────

  @Public()
  @Post('sessions/:sessionId/validate-access')
  validateAccess(
    @Param('sessionId') sessionId: string,
    @Body('password') password?: string,
  ) {
    return this.videoService.validateAccess(sessionId, password)
  }
}
