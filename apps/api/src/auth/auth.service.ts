import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { LoginDto } from '@castify/validators';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = crypto.createHash('sha256').update(dto.password).digest('hex');
    if (user.passwordHash !== passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      channelId: user.channelId,
    };

    return { accessToken: this.jwtService.sign(payload) };
  }

  async me(userId: string): Promise<{ id: string; email: string; role: string; channelId: string | null }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, email: user.email, role: user.role, channelId: user.channelId };
  }
}
