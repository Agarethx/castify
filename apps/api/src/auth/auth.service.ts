import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  ApiEnv,
  LoginDto,
  RefreshTokenDto,
  RegisterWithChannelDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@castify/validators';
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

  // ── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterWithChannelDto): Promise<LoginResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Ya existe una cuenta con ese email');

    const slug = dto.channelName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    // Ensure slug uniqueness
    const slugBase = slug || 'channel';
    let finalSlug = slugBase;
    let attempt = 0;
    while (await this.prisma.channel.findUnique({ where: { slug: finalSlug } })) {
      attempt++;
      finalSlug = `${slugBase}-${attempt}`;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const channel = await this.prisma.channel.create({
      data: { name: dto.channelName, slug: finalSlug },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: 'CHANNEL_ADMIN',
        channelId: channel.id,
      },
    });

    // Auto-login after registration
    return this.login({ email: dto.email, password: dto.password });
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; devToken?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always return success to avoid email enumeration
    if (!user) {
      return { message: 'Si existe una cuenta con ese email, recibirás un enlace de recuperación.' };
    }

    // Invalidate previous tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data:  { used: true },
    });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    // TODO in production: send email with reset link
    // await this.mailerService.sendPasswordReset(user.email, token)

    const isDev = this.config.get('NODE_ENV', { infer: false }) !== 'production';

    return {
      message: 'Si existe una cuenta con ese email, recibirás un enlace de recuperación.',
      ...(isDev ? { devToken: token } : {}),
    };
  }

  // ── Reset password ────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestException('El enlace es inválido o ya expiró');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await Promise.all([
      this.prisma.user.update({
        where: { id: record.userId },
        data:  { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data:  { used: true },
      }),
      // Invalidate all refresh tokens so existing sessions are kicked out
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return { message: 'Contraseña actualizada. Ya podés iniciar sesión.' };
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
