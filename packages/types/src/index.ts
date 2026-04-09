// ─── Enums ────────────────────────────────────────────────────────────────────

export type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type Role = 'SUPER_ADMIN' | 'CHANNEL_ADMIN' | 'VIEWER';
export type ContentType = 'live' | 'vod';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type AdBreakPosition = 'preroll' | 'midroll' | 'postroll';

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  plan: Plan;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  channelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithChannel extends User {
  channel: Channel | null;
}

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

export interface AdBreak {
  id: string;
  contentId: string;
  position: AdBreakPosition;
  vastUrl: string;
  durationSecs: number;
  createdAt: Date;
}

// ─── Auth DTOs ────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: Pick<User, 'id' | 'email' | 'role' | 'channelId'>;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

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
