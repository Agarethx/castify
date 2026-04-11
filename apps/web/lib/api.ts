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

  const res = await fetch(`${API_URL}${path}`, { headers, cache: 'no-store' });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ message: res.statusText }))) as Partial<ApiError>;
    throw new ApiClientError(res.status, error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
