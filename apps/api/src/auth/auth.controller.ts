import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { LoginSchema, RefreshTokenSchema } from '@castify/validators';
import { LoginResponse, UserWithChannel } from '@castify/types';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from '../tenant/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { JwtPayload } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): Promise<LoginResponse> {
    const dto = LoginSchema.parse(body);
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: unknown): Promise<{ accessToken: string; refreshToken: string }> {
    const dto = RefreshTokenSchema.parse(body);
    return this.authService.refresh(dto);
  }

  @Post('logout')
  async logout(
    @Req() req: FastifyRequest,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: boolean }> {
    const rawToken = req.headers['authorization']?.replace('Bearer ', '');
    // The refresh token is passed in the body by convention
    const body = req.body as Record<string, string> | undefined;
    const refreshToken = body?.['refreshToken'] ?? rawToken;
    await this.authService.logout(refreshToken, user.sub);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload): Promise<UserWithChannel> {
    return this.authService.me(user.sub);
  }
}
