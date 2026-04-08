export type ChannelPlan = 'starter' | 'pro' | 'enterprise';

export interface Channel {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  plan: ChannelPlan;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ContentType = 'live' | 'vod';
export type ContentStatus = 'draft' | 'published' | 'archived';

export interface Content {
  id: string;
  channelId: string;
  title: string;
  slug: string;
  type: ContentType;
  status: ContentStatus;
  thumbnailUrl: string | null;
  duration: number | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'admin' | 'channel_admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  channelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StreamSession {
  id: string;
  contentId: string;
  viewerId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  p2pOffloadPct: number;
  bytesFromPeers: bigint;
  bytesFromCdn: bigint;
}

export type AdBreakPosition = 'preroll' | 'midroll' | 'postroll';

export interface AdBreak {
  id: string;
  contentId: string;
  position: AdBreakPosition;
  vastUrl: string;
  durationSecs: number;
  createdAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}
