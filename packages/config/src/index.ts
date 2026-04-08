export const APP_NAME = 'Castify';
export const APP_VERSION = '0.0.1';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const JWT_ALGORITHM = 'HS256' as const;

export const SUPPORTED_PLANS = ['starter', 'pro', 'enterprise'] as const;
export type SupportedPlan = (typeof SUPPORTED_PLANS)[number];

export const PLAN_LIMITS: Record<SupportedPlan, { maxChannels: number; maxStorageGb: number }> = {
  starter: { maxChannels: 1, maxStorageGb: 10 },
  pro: { maxChannels: 5, maxStorageGb: 100 },
  enterprise: { maxChannels: -1, maxStorageGb: -1 }, // -1 = unlimited
};

export const REDIS_QUEUES = {
  TRANSCODING: 'transcoding',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
} as const;

export const CONTENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

export const AD_POSITIONS = {
  PREROLL: 'preroll',
  MIDROLL: 'midroll',
  POSTROLL: 'postroll',
} as const;
