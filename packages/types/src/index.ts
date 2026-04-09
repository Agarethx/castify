// ─── Enums ────────────────────────────────────────────────────────────────────

export type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE';
export type Role = 'SUPER_ADMIN' | 'CHANNEL_ADMIN' | 'VIEWER';
export type ContentType = 'LIVE' | 'VOD';
export type ContentStatus = 'INACTIVE' | 'ACTIVE' | 'PROCESSING' | 'ERROR';

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
  type: ContentType;
  status: ContentStatus;
  streamKey: string;
  hlsUrl: string | null;
  localPath: string | null;
  durationSec: number | null;
  createdAt: string;
}

export interface StreamSession {
  id: string;
  contentId: string;
  startedAt: string;
  endedAt: string | null;
  bytesFromPeers: number;
  bytesFromCdn: number;
  p2pOffloadPct: number;
  avgLatencyMs: number;
  peersConnected: number;
  qualityChanges: number;
}

export interface CreateContentDto {
  title: string;
  type: ContentType;
}

export interface ChannelWithContents extends Channel {
  contents: Content[];
}

export interface PublicContent {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  hlsUrl: string | null;
  durationSec: number | null;
  createdAt: string;
}

export interface PublicChannel {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  isActive: boolean;
  contents: PublicContent[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: Pick<User, 'id' | 'email' | 'role' | 'channelId'>;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface CreateChannelResponse {
  channel: Channel;
  liveContent: { id: string; streamKey: string };
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamStatusResponse {
  content: Content;
  activeSession: StreamSession | null;
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

// ─── Player ───────────────────────────────────────────────────────────────────

export type PlayerEventType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'buffering_start'
  | 'buffering_end'
  | 'quality_change'
  | 'segment_loaded'
  | 'error'
  | 'ended';

export interface PlayerEvent {
  type: PlayerEventType;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface SegmentLoadedData {
  url: string;
  /** El Scheduler determina si fue peer o CDN */
  source: 'peer' | 'cdn';
  latencyMs: number;
  sizeBytes: number;
  quality: string;
}

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  /** e.g. '360p' | '720p' | '1080p' */
  name: string;
}

export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'ended';
  currentTime: number;
  duration: number | null;
  /** segundos bufferizados adelante */
  buffered: number;
  quality: QualityLevel | null;
  availableQualities: QualityLevel[];
  volume: number;
  muted: boolean;
  isLive: boolean;
  /** El Scheduler cambia esto en Prompt 05 */
  p2pEnabled: boolean;
  /** El Scheduler actualiza esto en Prompt 05 */
  bytesFromPeers: number;
  /** El Scheduler actualiza esto en Prompt 05 */
  bytesFromCdn: number;
}
