import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Channel } from '@castify/types'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import { AnalyticsService } from './analytics.service'

@Controller('channels/me/content/:contentId/analytics')
@UseGuards(TenantGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // GET /api/channels/me/content/:contentId/analytics/live
  // Higher rate limit — dashboards poll this every few seconds
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('live')
  getLiveAnalytics(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.analyticsService.getLiveAnalytics(tenant.id, contentId)
  }

  // GET /api/channels/me/content/:contentId/analytics/retention
  @Get('retention')
  getRetention(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.analyticsService.getRetention(tenant.id, contentId)
  }

  // GET /api/channels/me/content/:contentId/analytics/summary
  @Get('summary')
  getSummary(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.analyticsService.getSummary(tenant.id, contentId)
  }
}
