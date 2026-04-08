import { z } from 'zod';

// ─── Channel ────────────────────────────────────────────────────────────────

export const CreateChannelSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.enum(['starter', 'pro', 'enterprise']),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional().default('#000000'),
  logoUrl: z.string().url('Must be a valid URL').optional(),
});

export type CreateChannelDto = z.infer<typeof CreateChannelSchema>;

// ─── Content ─────────────────────────────────────────────────────────────────

export const CreateContentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['live', 'vod']),
  channelId: z.string().uuid('channelId must be a valid UUID'),
  thumbnailUrl: z.string().url('Must be a valid URL').optional(),
  duration: z.number().int().positive().optional(),
});

export type CreateContentDto = z.infer<typeof CreateContentSchema>;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email('Must be a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginDto = z.infer<typeof LoginSchema>;

export const RegisterSchema = LoginSchema.extend({
  role: z.enum(['admin', 'channel_admin', 'viewer']).optional().default('viewer'),
  channelId: z.string().uuid().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── API Env (apps/api) ───────────────────────────────────────────────────────

export const ApiEnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BUNNY_API_KEY: z.string().min(1, 'BUNNY_API_KEY is required'),
  BUNNY_STORAGE_ZONE: z.string().min(1, 'BUNNY_STORAGE_ZONE is required'),
  PEER5_KEY: z.string().min(1, 'PEER5_KEY is required'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

// ─── Web Env (apps/web) ───────────────────────────────────────────────────────

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL must be a valid URL'),
  NEXT_PUBLIC_PEER5_KEY: z.string().min(1, 'NEXT_PUBLIC_PEER5_KEY is required'),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;
