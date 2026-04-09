import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { ApiEnv } from '@castify/validators';
import { Public } from '../auth/decorators/public.decorator';
import { StreamingService } from './streaming.service';

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

  @Public()
  @Get('health')
  async health(): Promise<{ srsReachable: boolean; activeStreams: number }> {
    const { srsReachable, activeStreams } = await this.streamingService.getSrsStats();
    return { srsReachable, activeStreams };
  }
}
