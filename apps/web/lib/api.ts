import type { Channel, Content, ApiError } from '@castify/types';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ message: res.statusText }))) as Partial<ApiError>;
    throw new ApiClientError(res.status, error.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  channels: {
    findBySlug: (slug: string): Promise<Channel> => fetcher<Channel>(`/channels/${slug}`),
    findAll: (): Promise<Channel[]> => fetcher<Channel[]>('/channels'),
  },

  content: {
    findByChannel: (channelId: string): Promise<Content[]> =>
      fetcher<Content[]>(`/channels/${channelId}/content`),
    findBySlug: (channelId: string, slug: string): Promise<Content> =>
      fetcher<Content>(`/channels/${channelId}/content/${slug}`),
  },
} as const;
