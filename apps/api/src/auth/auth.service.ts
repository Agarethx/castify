import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ApiEnv, LoginDto, RefreshTokenDto } from '@castify/validators';
import { LoginResponse, UserWithChannel } from '@castify/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtPayload } from './strategies/jwt.strategy';

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<ApiEnv, true>,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      channelId: user.channelId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, channelId: user.channelId },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    // Fast check: Redis
    const userId = await this.redis.get(`refresh:${dto.refreshToken}`);
    if (!userId) throw new UnauthorizedException('Refresh token inválido o expirado');

    // Double-check: DB
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });
    if (!stored || stored.userId !== userId || stored.expiresAt < new Date()) {
      await this.invalidateRefreshToken(dto.refreshToken, userId);
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // Rotate: invalidate old, emit new
    await this.invalidateRefreshToken(dto.refreshToken, userId);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      channelId: user.channelId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (!refreshToken) return;
    await this.invalidateRefreshToken(refreshToken, userId);
  }

  async me(userId: string): Promise<UserWithChannel> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { channel: true },
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      channelId: user.channelId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      channel: user.channel,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

    await Promise.all([
      this.prisma.refreshToken.create({ data: { token, userId, expiresAt } }),
      this.redis.set(`refresh:${token}`, userId, 'EX', REFRESH_TTL_SECONDS),
    ]);

    return token;
  }

  private async invalidateRefreshToken(token: string, userId: string): Promise<void> {
    await Promise.allSettled([
      this.redis.del(`refresh:${token}`),
      this.prisma.refreshToken.deleteMany({ where: { token, userId } }),
    ]);
  }
}
