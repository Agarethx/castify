import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { LoginSchema } from '@castify/validators';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { JwtPayload } from './strategies/jwt.strategy';

interface RequestWithUser {
  user: JwtPayload;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: unknown): Promise<{ accessToken: string }> {
    const dto = LoginSchema.parse(body);
    return this.authService.login(dto);
  }

  @Get('me')
  me(@Request() req: RequestWithUser): Promise<{ id: string; email: string; role: string; channelId: string | null }> {
    return this.authService.me(req.user.sub);
  }
}
