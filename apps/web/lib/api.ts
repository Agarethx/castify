// ── Dashboard summary type (mirrors DashboardService response) ────────────────

export interface DashboardStats {
  totalContents: number
  liveStreams: number
  vodContents: number
  activePrivateSessions: number
  bandwidthGbUsed: number
  cdnGbUsed: number
  p2pGbUsed: number
  bandwidthCapGb: number
  bandwidthCapPct: number
  currentViewers: number
  p2pOffloadPct: number
  avgP2pOffloadPct: number
  estimatedSavingsUsd: number
  multistreamActive: number
}

export interface Clip {
  id: string
  channelId: string
  contentId: string
  title: string
  startSec: number
  endSec: number
  durationSec: number
  hlsUrl: string | null
  thumbnailUrl: string | null
  status: 'processing' | 'ready' | 'failed'
  platforms: string[]
  views: number
  createdAt: string
  updatedAt: string
  content?: { title: string; type: string; hlsUrl: string | null } | null
}

export interface CreateClipDto {
  contentId: string
  title: string
  startSec: number
  endSec: number
  thumbnailUrl?: string
  platforms?: string[]
}

export interface EPGEntry {
  id: string
  channelId: string
  title: string
  description: string | null
  contentId: string | null
  startTime: string
  endTime: string
  duration: number  // minutes
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  content?: { title: string; hlsUrl: string | null } | null
}

export interface CreateEPGEntryDto {
  title: string
  description?: string
  contentId?: string
  startTime: string
  endTime: string
  metadata?: Record<string, unknown>
}

export interface VideoSession {
  id: string
  channelId: string
  title: string
  mode: '1to1' | 'group'
  deliveryMode: string
  streamKey: string
  password: string | null
  ratePerGb: number
  webhookUrl: string | null
  status: 'created' | 'active' | 'ended'
  bandwidthGb: number
  totalCost: number | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

export interface CastifyVideoCurrentUsage {
  month: number
  year: number
  cdn1to1Gb: number
  hybridGb: number
  totalGb: number
  capGb: number
  capPct: number
  nearCap: boolean
  cdn1to1Cost: number
  hybridCost: number
  baseFee: number
  estimatedTotal: number
  concurrentActive: number
  maxConcurrent: number
  sessionCount: number
}

export interface CastifyVideoBillingRecord {
  id: string
  month: number
  year: number
  cdn1to1Gb: number
  hybridGb: number
  cdn1to1Cost: number
  hybridCost: number
  baseFee: number
  totalCost: number
  sessionCount: number
  paid: boolean
  paidAt: string | null
}

export interface CastifyVideoDashboard {
  activeSessions: number
  monthlyGbUsed: number
  bandwidthCapGb: number
  capPct: number
  nearCap: boolean
  estimatedCostUsd: number
  baseFee: number
  totalEstimate: number
}

export interface DashboardSummary {
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE'
  stats: DashboardStats
  castifyVideo: CastifyVideoDashboard | null
}

// ─────────────────────────────────────────────────────────────────────────────

import type {
  Channel,
  ChannelWithContents,
  Content,
  LoginResponse,
  PublicChannel,
  StreamStatusResponse,
  UserWithChannel,
  ApiError,
} from '@castify/types';
import type { LoginDto, RefreshTokenDto, CreateContentDto } from '@castify/validators';
import Cookies from 'js-cookie';

const API_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

// Resolved at call-time (not module init) so Docker runtime env vars work
function getInternalApiUrl(): string {
  return process.env['API_INTERNAL_URL'] ?? API_URL;
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  private tenantSlug: string | null = null;

  setTenant(slug: string): void {
    this.tenantSlug = slug;
  }

  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };

    const token = Cookies.get('castify_access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const slug = this.tenantSlug ?? Cookies.get('castify_tenant');
    if (slug) headers['X-Tenant-Slug'] = slug;

    return headers;
  }

  private async fetch<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: this.getHeaders(init?.headers as Record<string, string>),
    });

    if (res.status === 401 && retry) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.fetch<T>(path, init, false);
    }

    if (!res.ok) {
      const error = (await res.json().catch(() => ({ message: res.statusText }))) as Partial<ApiError>;
      throw new ApiClientError(res.status, error.message ?? res.statusText);
    }

    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = Cookies.get('castify_refresh_token');
    if (!refreshToken) return false;
    try {
      const data = await this.auth.refresh({ refreshToken });
      Cookies.set('castify_access_token', data.accessToken, { expires: 1 / 96 });
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  clearTokens(): void {
    Cookies.remove('castify_access_token');
    Cookies.remove('castify_refresh_token');
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  auth = {
    login: async (dto: LoginDto): Promise<LoginResponse> => {
      const data = await this.fetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      Cookies.set('castify_access_token', data.accessToken, { expires: 1 / 96 });
      Cookies.set('castify_refresh_token', data.refreshToken, { expires: 7 });
      return data;
    },

    refresh: async (dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> =>
      this.fetch<{ accessToken: string; refreshToken: string }>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),

    logout: async (): Promise<void> => {
      const refreshToken = Cookies.get('castify_refresh_token');
      await this.fetch('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => null);
      this.clearTokens();
      Cookies.remove('castify_tenant');
    },

    me: (): Promise<UserWithChannel> => this.fetch<UserWithChannel>('/api/auth/me'),

    updateMyChannel: (dto: { name?: string; slug?: string }): Promise<UserWithChannel> =>
      this.fetch<UserWithChannel>('/api/auth/me/channel', {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),

    register: async (dto: { email: string; password: string; channelName: string }): Promise<LoginResponse> => {
      const data = await this.fetch<LoginResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      Cookies.set('castify_access_token', data.accessToken, { expires: 1 / 96 });
      Cookies.set('castify_refresh_token', data.refreshToken, { expires: 7 });
      return data;
    },

    forgotPassword: (email: string): Promise<{ message: string; devToken?: string }> =>
      this.fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, password: string): Promise<{ message: string }> =>
      this.fetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),
  };

  // ── Channels ───────────────────────────────────────────────────────────────

  channels = {
    findAll: (): Promise<Channel[]> => this.fetch<Channel[]>('/api/channels'),
    getMyChannel: (): Promise<ChannelWithContents> => this.fetch<ChannelWithContents>('/api/channels/me'),
    createContent: (data: CreateContentDto): Promise<Content> =>
      this.fetch<Content>('/api/channels/me/content', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getPublicChannel: (slug: string): Promise<PublicChannel> =>
      this.fetch<PublicChannel>(`/api/public/channels/${slug}`),
  };

  // ── VOD ────────────────────────────────────────────────────────────────────

  vod = {
    upload: (
      file: File,
      onProgress?: (pct: number) => void,
    ): Promise<{ contentId: string; status: string }> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as { contentId: string; status: string });
          } else {
            try {
              const err = JSON.parse(xhr.responseText) as { message?: string };
              reject(new ApiClientError(xhr.status, err.message ?? xhr.statusText));
            } catch {
              reject(new ApiClientError(xhr.status, xhr.statusText));
            }
          }
        };

        xhr.onerror = () => reject(new ApiClientError(0, 'Network error'));

        const token = typeof document !== 'undefined'
          ? (document.cookie.match(/castify_access_token=([^;]+)/) ?? [])[1]
          : undefined;
        const slug = typeof document !== 'undefined'
          ? (document.cookie.match(/castify_tenant=([^;]+)/) ?? [])[1]
          : undefined;

        xhr.open('POST', `${API_URL}/api/channels/me/vod/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (slug)  xhr.setRequestHeader('X-Tenant-Slug', slug);
        xhr.send(formData);
      }),

    getStatus: (contentId: string): Promise<{
      contentId: string;
      status: string;
      hlsUrl: string | null;
      durationSec: number | null;
    }> => this.fetch(`/api/channels/me/vod/status/${contentId}`),

    getMyContents: (): Promise<Content[]> =>
      this.fetch<Content[]>('/api/channels/me/content'),
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────

  dashboard = {
    getSummary: () => this.fetch<DashboardSummary>('/api/channels/me/dashboard'),
  };

  // ── Castify Video ─────────────────────────────────────────────────────────

  castifyVideo = {
    getCurrentUsage: () =>
      this.fetch<CastifyVideoCurrentUsage>('/api/castify-video/billing/current'),

    getBillingHistory: () =>
      this.fetch<CastifyVideoBillingRecord[]>('/api/castify-video/billing/history'),

    listSessions: (status?: 'active' | 'ended' | 'created') =>
      this.fetch<VideoSession[]>(
        `/api/castify-video/sessions${status ? `?status=${status}` : ''}`,
      ),

    createSession: (body: {
      title: string
      mode: '1to1' | 'group'
      password?: string
      webhookUrl?: string
    }) =>
      this.fetch<{
        id: string
        streamKey: string
        password?: string
        deliveryMode: string
        expectedRate: number
        status: string
      }>('/api/castify-video/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    startSession: (sessionId: string) =>
      this.fetch<void>(`/api/castify-video/sessions/${sessionId}/start`, { method: 'POST' }),

    endSession: (sessionId: string) =>
      this.fetch<void>(`/api/castify-video/sessions/${sessionId}/end`, { method: 'POST' }),

    getSessionAnalytics: (sessionId: string) =>
      this.fetch<unknown>(`/api/castify-video/sessions/${sessionId}/analytics`),

    generateMonthlyBill: (year: number, month: number) =>
      this.fetch<unknown>(`/api/castify-video/billing/${year}/${month}/generate`, { method: 'POST' }),
  };

  // ── Clips ─────────────────────────────────────────────────────────────────

  clips = {
    list: (contentId?: string) =>
      this.fetch<Clip[]>(`/api/channels/me/clips${contentId ? `?contentId=${contentId}` : ''}`),

    getOne: (clipId: string) =>
      this.fetch<Clip>(`/api/channels/me/clips/${clipId}`),

    create: (body: CreateClipDto) =>
      this.fetch<Clip>('/api/channels/me/clips', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    publish: (clipId: string, platforms: string[]) =>
      this.fetch<{ published: string[]; clipId: string }>(
        `/api/channels/me/clips/${clipId}/publish`,
        { method: 'POST', body: JSON.stringify({ platforms }) },
      ),

    delete: (clipId: string) =>
      this.fetch<void>(`/api/channels/me/clips/${clipId}`, { method: 'DELETE' }),
  };

  // ── EPG ───────────────────────────────────────────────────────────────────

  epg = {
    listByDate: (date: string) =>
      this.fetch<EPGEntry[]>(`/api/channels/me/epg?date=${date}`),

    getNext24h: () =>
      this.fetch<EPGEntry[]>('/api/channels/me/epg/24h'),

    create: (body: CreateEPGEntryDto) =>
      this.fetch<EPGEntry>('/api/channels/me/epg', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    update: (epgId: string, body: Partial<CreateEPGEntryDto>) =>
      this.fetch<EPGEntry>(`/api/channels/me/epg/${epgId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),

    delete: (epgId: string) =>
      this.fetch<void>(`/api/channels/me/epg/${epgId}`, { method: 'DELETE' }),
  };

  // ── Streaming ──────────────────────────────────────────────────────────────

  streaming = {
    getStatus: (streamKey: string): Promise<StreamStatusResponse> =>
      this.fetch<StreamStatusResponse>(`/api/streaming/status/${streamKey}`),

    getWhipConfig: (streamKey: string): Promise<{ whipUrl: string; iceServers: RTCIceServer[] }> =>
      this.fetch<{ whipUrl: string; iceServers: RTCIceServer[] }>(
        `/api/streaming/whip-config/${streamKey}`,
      ),
  };
}

export const api = new ApiClient();

// ── Server-side fetcher ────────────────────────────────────────────────────────

export async function serverFetch<T>(
  path: string,
  token?: string,
  tenantSlug?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const res = await fetch(`${getInternalApiUrl()}${path}`, { headers, cache: 'no-store' });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ message: res.statusText }))) as Partial<ApiError>;
    throw new ApiClientError(res.status, error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
