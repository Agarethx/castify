// lib/p2p/tracker.ts — BROWSER ONLY (never import directly — use dynamic import)
// Uses bittorrent-tracker for WebSocket peer discovery + native WebRTC for data transfer.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackerConfig {
  /** WebSocket tracker URL, e.g. ws://localhost:1337/announce */
  announceUrl: string;
  /** 20-byte hex string derived from streamKey + quality */
  infoHash: string;
  /** UUID of this viewer — stable per session */
  peerId: string;
}

export interface PeerCandidate {
  peerId: string;
  latencyMs: number;
  hasSegment: (segmentUrl: string) => boolean;
  request: (segmentUrl: string) => Promise<ArrayBuffer>;
  score: number;
}

// ─── Internal peer state ──────────────────────────────────────────────────────

interface PeerConnection {
  peerId: string;
  rtc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  latencyMs: number;
  cachedSegments: Set<string>;
  pingStart: number;
}

// ─── P2PTracker ───────────────────────────────────────────────────────────────

export class P2PTracker {
  private peers = new Map<string, PeerConnection>();
  private client: any = null;
  private announcedSegments = new Set<string>();
  private config: TrackerConfig | null = null;

  private readonly RTC_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  /** Conectar al tracker y comenzar a descubrir peers */
  async connect(config: TrackerConfig): Promise<void> {
    this.config = config;

    try {
      // Dynamic import — bittorrent-tracker uses native WebRTC in browsers
      const { default: Client } = await import('bittorrent-tracker') as { default: any };

      this.client = new Client({
        infoHash: config.infoHash,
        peerId: config.peerId,
        announce: [config.announceUrl],
        rtcConfig: this.RTC_CONFIG,
      }) as any;

      this.client.on('peer', (peer: any) => {
        this.handlePeer(peer as any);
      });

      this.client.on('error', (err: Error) => {
        // Tracker connection failure is non-fatal — fall back to CDN silently
        console.debug('[P2PTracker] tracker error (non-fatal):', err.message);
      });

      this.client.on('warning', (msg: string | Error) => {
        console.debug('[P2PTracker] warning:', String(msg));
      });

      this.client.start();
    } catch (err) {
      // bittorrent-tracker unavailable (SSR guard, env issue) — degrade gracefully
      console.debug('[P2PTracker] could not connect to tracker:', err);
    }
  }

  /** Obtener peers disponibles ordenados por score (latencia) */
  getAvailablePeers(): PeerCandidate[] {
    return Array.from(this.peers.values())
      .filter((p) => p.channel?.readyState === 'open')
      .map((p) => this.toPeerCandidate(p));
  }

  /** Anunciar qué segmentos tenemos cacheados */
  announce(segmentUrls: string[]): void {
    this.announcedSegments = new Set(segmentUrls);
    if (!this.client) return;

    try {
      // Broadcast available segments to all connected peers
      for (const peer of this.peers.values()) {
        if (peer.channel?.readyState === 'open') {
          peer.channel.send(JSON.stringify({ type: 'have', urls: segmentUrls }));
        }
      }
    } catch {
      // ignore broadcast errors
    }
  }

  /** Desconectar limpiamente */
  destroy(): void {
    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.rtc.close();
    }
    this.peers.clear();

    if (this.client) {
      try {
        this.client.destroy();
      } catch {
        // ignore cleanup errors
      }
      this.client = null;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private handlePeer(peer: any): void {
    // bittorrent-tracker provides a SimplePeer-like peer object
    const peerId = String(peer.id ?? peer.peerId ?? Math.random().toString(36).slice(2));

    if (this.peers.has(peerId)) return;

    const rtc = new RTCPeerConnection(this.RTC_CONFIG);
    const channel = rtc.createDataChannel('castify', { ordered: false });

    const state: PeerConnection = {
      peerId,
      rtc,
      channel,
      latencyMs: 999,
      cachedSegments: new Set(),
      pingStart: 0,
    };

    this.peers.set(peerId, state);

    channel.onopen = () => {
      // Measure latency with a ping/pong
      state.pingStart = Date.now();
      channel.send(JSON.stringify({ type: 'ping' }));
    };

    channel.onmessage = (event: MessageEvent) => {
      this.handleMessage(state, event);
    };

    channel.onclose = () => {
      this.peers.delete(peerId);
    };

    // Forward ICE candidates from the bittorrent-tracker peer signal
    if (typeof peer.signal === 'function') {
      peer.on?.('signal', (data: unknown) => {
        rtc.setRemoteDescription(data as RTCSessionDescriptionInit).catch(() => null);
      });
    }
  }

  private handleMessage(peer: PeerConnection, event: MessageEvent): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (msg['type']) {
      case 'ping':
        peer.channel?.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'pong':
        peer.latencyMs = Date.now() - peer.pingStart;
        break;
      case 'have':
        (msg['urls'] as string[] ?? []).forEach((url) => peer.cachedSegments.add(url));
        break;
      case 'get': {
        // Peer is requesting a segment from us — serve from cache if we have it
        const url = String(msg['url'] ?? '');
        if (this.announcedSegments.has(url)) {
          // In a full implementation, we'd send the actual segment data here.
          // For now, respond with a "not available" message.
          peer.channel?.send(JSON.stringify({ type: 'unavailable', url }));
        }
        break;
      }
      default:
        break;
    }
  }

  private toPeerCandidate(peer: PeerConnection): PeerCandidate {
    return {
      peerId: peer.peerId,
      latencyMs: peer.latencyMs,
      hasSegment: (url: string) => peer.cachedSegments.has(url),
      request: (url: string) => this.requestSegment(peer, url),
      score: Math.max(0, 1 - peer.latencyMs / 800),
    };
  }

  private requestSegment(peer: PeerConnection, url: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (peer.channel?.readyState !== 'open') {
        reject(new Error('Data channel not open'));
        return;
      }

      const timeout = setTimeout(() => {
        peer.channel?.removeEventListener('message', handler);
        reject(new Error('Peer request timeout'));
      }, 3000);

      const handler = (event: MessageEvent) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(event.data)) as Record<string, unknown>; }
        catch { return; }

        if (msg['url'] !== url) return;

        clearTimeout(timeout);
        peer.channel?.removeEventListener('message', handler);

        if (msg['type'] === 'data' && msg['payload'] instanceof ArrayBuffer) {
          resolve(msg['payload'] as ArrayBuffer);
        } else {
          reject(new Error('Peer does not have segment'));
        }
      };

      peer.channel.addEventListener('message', handler);
      peer.channel.send(JSON.stringify({ type: 'get', url }));
    });
  }
}

/** Deriva un infoHash de 20 chars a partir del streamKey y la calidad */
export function deriveInfoHash(streamKey: string, qualityHeight: number): string {
  const raw = `castify:${streamKey}:${qualityHeight}`;
  // Simple deterministic hash (FNV-1a) — no crypto needed for tracking
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').repeat(3).slice(0, 20);
}
