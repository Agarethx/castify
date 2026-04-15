import { Controller, Get, UseGuards } from '@nestjs/common'
import { Channel } from '@castify/types'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import { DashboardService } from './dashboard.service'

@Controller('channels/me/dashboard')
@UseGuards(TenantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(@CurrentTenant() tenant: Channel) {
    return this.dashboardService.getSummary(tenant.id)
  }
}
