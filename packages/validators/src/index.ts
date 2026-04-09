import { z } from 'zod';

// ─── Channel ─────────────────────────────────────────────────────────────────

export const CreateChannelSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug debe ser alfanumérico en minúsculas con guiones'),
  plan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Debe ser un color hexadecimal válido')
    .optional()
    .default('#000000'),
  logoUrl: z.string().url('Debe ser una URL válida').optional(),
});

export type CreateChannelDto = z.infer<typeof CreateChannelSchema>;

// ─── Content ─────────────────────────────────────────────────────────────────

export const CreateContentSchema = z.object({
  title: z.string().min(2, 'El título debe tener al menos 2 caracteres').max(100, 'El título no puede superar 100 caracteres'),
  type: z.enum(['LIVE', 'VOD']),
});

export type CreateContentDto = z.infer<typeof CreateContentSchema>;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email('Debe ser un email válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().uuid('El refresh token debe ser un UUID válido'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const RegisterSchema = LoginSchema.extend({
  role: z.enum(['SUPER_ADMIN', 'CHANNEL_ADMIN', 'VIEWER']).optional().default('VIEWER'),
  channelId: z.string().uuid().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── API Env ──────────────────────────────────────────────────────────────────

export const ApiEnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida'),
  REDIS_URL: z.string().url('REDIS_URL debe ser una URL válida'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  STREAMING_SECRET: z.string().min(1).default('dev-secret'),
  BUNNY_API_KEY: z.string().min(1).default('placeholder'),
  BUNNY_STORAGE_ZONE: z.string().min(1).default('placeholder'),
  PEER5_KEY: z.string().min(1).default('placeholder'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

// ─── Web Env ──────────────────────────────────────────────────────────────────

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL debe ser una URL válida'),
  NEXT_PUBLIC_PEER5_KEY: z.string().min(1).default('placeholder'),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;
