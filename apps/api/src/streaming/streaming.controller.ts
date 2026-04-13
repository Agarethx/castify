import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { ApiEnv } from '@castify/validators';
import type { NetworkConfig } from '@castify/types';
import { Channel } from '@castify/types';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/decorators/current-tenant.decorator';
import { StreamingService } from './streaming.service';
import { MultiStreamingService, MultiStreamDestinations } from './multistreaming.service';

interface SrsHookBody {
  app?: string;
  stream?: string;
  action?: string;
  [key: string]: unknown;
}

@Controller('streaming')
export class StreamingController {
  constructor(
    private readonly streamingService: StreamingService,
    private readonly multiStreamingService: MultiStreamingService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  /**
   * Valida el secret via header X-Streaming-Secret o query param ?secret=
   * SRS no soporta headers custom → se usa query param en la URL del hook.
   */
  private validateSecret(req: FastifyRequest, querySecret?: string): void {
    const expected = this.config.get('STREAMING_SECRET', { infer: true });
    const fromHeader = req.headers['x-streaming-secret'];
    const fromQuery = querySecret;
    if (fromHeader !== expected && fromQuery !== expected) {
      throw new UnauthorizedException('Streaming secret inválido');
    }
  }

  // ── SRS Webhooks ──────────────────────────────────────────────────────────

  @Public()
  @Post('on-publish')
  @HttpCode(200)
  async onPublish(
    @Req() req: FastifyRequest,
    @Body() body: SrsHookBody,
    @Query('secret') secret?: string,
  ): Promise<{ code: number }> {
    this.validateSecret(req, secret);
    const streamKey = body.stream;
    if (!streamKey) return { code: 1 };
    await this.streamingService.onPublish(streamKey);
    return { code: 0 };
  }

  @Public()
  @Post('on-unpublish')
  @HttpCode(200)
  async onUnpublish(
    @Req() req: FastifyRequest,
    @Body() body: SrsHookBody,
    @Query('secret') secret?: string,
  ): Promise<{ code: number }> {
    this.validateSecret(req, secret);
    const streamKey = body.stream;
    if (!streamKey) return { code: 1 };
    await this.streamingService.onUnpublish(streamKey);
    return { code: 0 };
  }

  // ── Status & Health ───────────────────────────────────────────────────────

  @Get('status/:streamKey')
  getStatus(@Param('streamKey') streamKey: string) {
    return this.streamingService.getStatus(streamKey);
  }

  // ── WebRTC / WHIP config ──────────────────────────────────────────────────

  @Public()
  @Get('whip-config/:streamKey')
  async getWhipConfig(
    @Param('streamKey') streamKey: string,
  ): Promise<{ whipUrl: string; iceServers: { urls: string[] }[] }> {
    return this.streamingService.getWhipConfig(streamKey);
  }

  @Public()
  @Get('health')
  async health(): Promise<{ srsReachable: boolean; activeStreams: number }> {
    const { srsReachable, activeStreams } = await this.streamingService.getSrsStats();
    return { srsReachable, activeStreams };
  }

  // ── Session snapshot ──────────────────────────────────────────────────────

  @Public()
  @Post('session/snapshot')
  @HttpCode(204)
  async saveSnapshot(
    @Headers('x-session-token') sessionToken: string,
    @Body() body: unknown,
  ): Promise<void> {
    // Validación mínima: el token debe existir y ser un UUID
    if (!sessionToken || !/^[0-9a-f-]{36}$/.test(sessionToken)) return;
    await this.streamingService.saveSnapshot(body);
  }

  // ── Network config (consumed by Scheduler) ────────────────────────────────

  @Public()
  @Get('config/:channelId')
  async getNetworkConfig(
    @Param('channelId') channelId: string,
    @Req() req: FastifyRequest,
  ): Promise<NetworkConfig> {
    const config = await this.streamingService.getNetworkConfig(channelId);
    // Cache-Control: max-age=60 (Fastify reply header)
    void (req as FastifyRequest & { raw: { res?: { setHeader?: (k: string, v: string) => void } } })
      .raw?.res?.setHeader?.('Cache-Control', 'public, max-age=60');
    return config;
  }

  // ── Multistreaming ────────────────────────────────────────────────────────

  @Throttle({ multistream: { limit: 10, ttl: 60_000 } })
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post(':contentId/multistream/start')
  startMultistream(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
    @Body() destinations: MultiStreamDestinations,
  ) {
    return this.multiStreamingService.startMultistream(tenant.id, contentId, destinations);
  }

  @Throttle({ multistream: { limit: 10, ttl: 60_000 } })
  @UseGuards(TenantGuard, RolesGuard)
  @Roles('CHANNEL_ADMIN', 'SUPER_ADMIN')
  @Post(':contentId/multistream/stop')
  @HttpCode(204)
  async stopMultistream(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ): Promise<void> {
    await this.multiStreamingService.stopMultistream(tenant.id, contentId);
  }

  @UseGuards(TenantGuard)
  @Get(':contentId/multistream/status')
  getMultistreamStatus(
    @CurrentTenant() tenant: Channel,
    @Param('contentId') contentId: string,
  ) {
    return this.multiStreamingService.getMultistreamStatus(tenant.id, contentId);
  }
}
