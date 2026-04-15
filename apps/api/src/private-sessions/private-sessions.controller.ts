import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Channel } from '@castify/types'
import { Public } from '../auth/decorators/public.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { TenantGuard } from '../tenant/tenant.guard'
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator'
import { CreateSessionDto, PrivateSessionsService } from './private-sessions.service'

// ── Protected routes: POST/GET/manage sessions ────────────────────────────────

@Controller('channels/me/sessions')
@UseGuards(TenantGuard, RolesGuard)
@Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
export class PrivateSessionsController {
  constructor(private readonly sessionsService: PrivateSessionsService) {}

  @Throttle({ sessions: { limit: 100, ttl: 60_000 } })
  @Post()
  createSession(
    @CurrentTenant() tenant: Channel,
    @Body() body: unknown,
  ) {
    const dto = body as CreateSessionDto
    return this.sessionsService.createSession(tenant.id, dto)
  }

  @Get(':sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.sessionsService.getSession(sessionId)
  }

  @Get(':sessionId/stats')
  getSessionStats(@Param('sessionId') sessionId: string) {
    return this.sessionsService.getSessionStats(sessionId)
  }

  @Post(':sessionId/start')
  @HttpCode(204)
  async startSession(@Param('sessionId') sessionId: string): Promise<void> {
    await this.sessionsService.startSession(sessionId)
  }

  @Post(':sessionId/end')
  @HttpCode(204)
  async endSession(@Param('sessionId') sessionId: string): Promise<void> {
    await this.sessionsService.endSession(sessionId)
  }
}

// ── Public route: viewers validate password before playback ───────────────────

@Controller('sessions')
export class SessionsPublicController {
  constructor(private readonly sessionsService: PrivateSessionsService) {}

  @Public()
  @Post(':sessionId/validate-password')
  validatePassword(
    @Param('sessionId') sessionId: string,
    @Body('password') password: string,
  ) {
    return this.sessionsService.validatePassword(sessionId, password)
  }
}
