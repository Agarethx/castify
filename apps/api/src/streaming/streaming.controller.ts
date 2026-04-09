import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { ApiEnv } from '@castify/validators';
import { Public } from '../auth/decorators/public.decorator';
import { StreamingService } from './streaming.service';

interface SrsPublishBody {
  app?: string;
  stream?: string;
  [key: string]: unknown;
}

@Controller('streaming')
export class StreamingController {
  constructor(
    private readonly streamingService: StreamingService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  private validateSecret(req: FastifyRequest): void {
    const secret = req.headers['x-streaming-secret'];
    const expected = this.config.get('STREAMING_SECRET', { infer: true });
    if (secret !== expected) {
      throw new UnauthorizedException('Streaming secret inválido');
    }
  }

  @Public()
  @Post('on-publish')
  @HttpCode(0)
  async onPublish(
    @Req() req: FastifyRequest,
    @Body() body: SrsPublishBody,
  ): Promise<number> {
    this.validateSecret(req);
    const streamKey = body.stream;
    if (!streamKey) throw new UnauthorizedException('streamKey ausente');
    await this.streamingService.onPublish(streamKey);
    return 0;
  }

  @Public()
  @Post('on-unpublish')
  @HttpCode(0)
  async onUnpublish(
    @Req() req: FastifyRequest,
    @Body() body: SrsPublishBody,
  ): Promise<number> {
    this.validateSecret(req);
    const streamKey = body.stream;
    if (!streamKey) throw new UnauthorizedException('streamKey ausente');
    await this.streamingService.onUnpublish(streamKey);
    return 0;
  }

  @Get('status/:streamKey')
  getStatus(@Param('streamKey') streamKey: string) {
    return this.streamingService.getStatus(streamKey);
  }
}
