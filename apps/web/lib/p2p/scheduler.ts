// lib/p2p/scheduler.ts — BROWSER ONLY (dynamic import required)
// Intercepts hls.js segment requests and decides: peer or CDN.

import Hls from 'hls.js';
import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderStats } from 'hls.js';
import type { NetworkConfig, PlayerState } from '@castify/types';
import type { P2PTracker, PeerCandidate } from './tracker';

// ─── Types ────────────────────────────────────────────────────────────────────

type LoaderCtor = new (config: HlsConfig) => Loader<LoaderContext>;

interface SegmentDecision {
  source: 'peer' | 'cdn';
  peer?: PeerCandidate;
}

// ─── CastifyScheduler ─────────────────────────────────────────────────────────

export class CastifyScheduler {
  private networkConfig: NetworkConfig;
  private tracker: P2PTracker;
  private playerState: PlayerState | null = null;

  constructor(tracker: P2PTracker, config: NetworkConfig) {
    this.tracker = tracker;
    this.networkConfig = config;
  }

  /**
   * Returns a hls.js Loader class that intercepts segment requests.
   * Pass this to: new Hls({ loader: scheduler.createLoader() })
   */
  createLoader(): LoaderCtor {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scheduler = this;
    const BaseCtor = Hls.DefaultConfig.loader as LoaderCtor;

    class SchedulerLoader extends BaseCtor {
      private pendingAbort: (() => void) | null = null;

      constructor(config: HlsConfig) {
        super(config);
      }

      load(
        context: LoaderContext,
        config: LoaderConfiguration,
        callbacks: LoaderCallbacks<LoaderContext>,
      ): void {
        // Only intercept HLS segment files (.ts, .m4s) — not manifests
        const isSegment = /\.(ts|m4s)(\?.*)?$/.test(context.url);

        if (!isSegment) {
          super.load(context, config, callbacks);
          return;
        }

        const decision = scheduler.decide(context.url);

        if (decision.source === 'cdn' || !decision.peer) {
          super.load(context, config, callbacks);
          return;
        }

        // Attempt from peer with CDN fallback
        const peer = decision.peer;
        let aborted = false;
        this.pendingAbort = () => { aborted = true; };

        peer
          .request(context.url)
          .then((buffer: ArrayBuffer) => {
            if (aborted) return;
            // Signal to the player that this segment came from a peer
            (window as Window & { __castifyLastSegmentSource?: string }).__castifyLastSegmentSource = 'peer';

            const now = Date.now();
            const stats: LoaderStats = {
              aborted: false,
              loaded: buffer.byteLength,
              total: buffer.byteLength,
              retry: 0,
              chunkCount: 1,
              bwEstimate: 0,
              loading: { start: now, first: now, end: now },
              parsing: { start: now, end: now },
              buffering: { start: now, first: now, end: now },
            };

            callbacks.onSuccess({ url: context.url, data: buffer }, stats, context, null);
          })
          .catch(() => {
            if (aborted) return;
            // Always fallback to CDN — never block playback
            super.load(context, config, callbacks);
          });
      }

      abort(): void {
        this.pendingAbort?.();
        this.pendingAbort = null;
        try { super.abort(); } catch { /* ignore */ }
      }

      destroy(): void {
        this.pendingAbort = null;
        try { super.destroy(); } catch { /* ignore */ }
      }
    }

    return SchedulerLoader;
  }

  // ── Decision algorithm ────────────────────────────────────────────────────

  private decide(segmentUrl: string): SegmentDecision {
    // REGLA 1: buffer bajo → siempre CDN — nunca arriesgar la experiencia
    const buffer = this.playerState?.buffered ?? 0;
    if (buffer < this.networkConfig.minBufferToUsePeerSec) {
      return { source: 'cdn' };
    }

    // REGLA 2: obtener peers con este segmento disponible
    const candidates = this.tracker
      .getAvailablePeers()
      .filter((p) => p.hasSegment(segmentUrl));

    if (candidates.length === 0) {
      return { source: 'cdn' };
    }

    // REGLA 3: calcular score de cada peer y ordenar
    const scored = candidates
      .map((peer) => ({ peer, score: this.scorePeer(peer) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best) return { source: 'cdn' };

    // REGLA 4: score mínimo (umbral configurable por NIS)
    if (best.score < this.networkConfig.peerScoreThreshold) {
      return { source: 'cdn' };
    }

    return { source: 'peer', peer: best.peer };
  }

  private scorePeer(peer: PeerCandidate): number {
    // Score 0-1: 0ms latencia = 1.0, maxPeerLatencyMs = 0.0
    const latencyScore = Math.max(0, 1 - peer.latencyMs / this.networkConfig.maxPeerLatencyMs);
    // Fase 2: agregar ISP match, historial de confiabilidad, etc.
    return latencyScore;
  }

  // ── Hooks called by CastifyPlayer ─────────────────────────────────────────

  /** Llamado cuando hls.js cambia de calidad — invalida el swarm */
  onQualityChange(_newQualityHeight: number): void {
    // Los peers tienen segmentos de la calidad anterior — se invalidan
    this.tracker.announce([]);
    // El tracker reconectará con el nuevo infoHash en la próxima sesión
  }

  /** Llamado por onStateChange del player */
  updatePlayerState(state: PlayerState): void {
    this.playerState = state;
  }

  /** Llamado periódicamente para refrescar la config del NIS */
  updateNetworkConfig(config: NetworkConfig): void {
    this.networkConfig = config;
  }
}
