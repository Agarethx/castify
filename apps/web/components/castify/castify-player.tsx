'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';
import type { PlayerEvent, PlayerState, QualityLevel, NetworkConfig } from '@castify/types';
import { PlayerControls } from './player-controls';
import { CastifyScheduler } from '@/lib/p2p/scheduler';
import { SessionReporter } from '@/lib/p2p/session-reporter';

// ─── Props ────────────────────────────────────────────────────────────────────

export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface CastifyPlayerProps {
  src: string;
  isLive?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  className?: string;
  /** contentId para el SessionReporter */
  contentId?: string;
  /** channelId para la config del NIS */
  channelId?: string;
  /** Activar P2P (default: true si contentId+channelId están presentes) */
  p2pEnabled?: boolean;
  /** Hook para el Scheduler P2P */
  onEvent?: (event: PlayerEvent) => void;
  /** Hook para el SessionReporter */
  onStateChange?: (state: PlayerState) => void;
  /** URL del logo a mostrar sobre el player */
  logo?: string;
  /** Posición del logo (default: top-left) */
  logoPosition?: LogoPosition;
  /** Color primario en hex (#rrggbb) — se inyecta como --castify-primary */
  primaryColor?: string;
  /** Color de acento en hex — se inyecta como --castify-accent */
  accentColor?: string;
  /** Ocultar controles por completo */
  hideControls?: boolean;
}

// ─── State machine ────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_STATUS'; status: PlayerState['status'] }
  | { type: 'SET_TIME'; currentTime: number; buffered: number }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_QUALITIES'; qualities: QualityLevel[]; current: QualityLevel | null }
  | { type: 'SET_QUALITY'; quality: QualityLevel | null }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_LIVE'; isLive: boolean }
  | { type: 'SET_P2P_STATS'; peersConnected: number; bytesFromPeers: number; bytesFromCdn: number; p2pEnabled: boolean; p2pOffloadPct: number };

function makeInitialState(isLive: boolean, muted: boolean): PlayerState {
  return {
    status: 'idle',
    currentTime: 0,
    duration: null,
    buffered: 0,
    quality: null,
    availableQualities: [],
    volume: 1,
    muted,
    isLive,
    p2pEnabled: false,
    bytesFromPeers: 0,
    bytesFromCdn: 0,
    peersConnected: 0,
    p2pOffloadPct: 0,
  };
}

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'SET_STATUS':    return { ...state, status: action.status };
    case 'SET_TIME':      return { ...state, currentTime: action.currentTime, buffered: action.buffered };
    case 'SET_DURATION':  return { ...state, duration: action.duration };
    case 'SET_QUALITIES': return { ...state, availableQualities: action.qualities, quality: action.current };
    case 'SET_QUALITY':   return { ...state, quality: action.quality };
    case 'SET_VOLUME':    return { ...state, volume: action.volume };
    case 'SET_MUTED':     return { ...state, muted: action.muted };
    case 'SET_LIVE':      return { ...state, isLive: action.isLive };
    case 'SET_P2P_STATS': return {
      ...state,
      p2pEnabled: action.p2pEnabled,
      bytesFromPeers: action.bytesFromPeers,
      bytesFromCdn: action.bytesFromCdn,
      peersConnected: action.peersConnected,
      p2pOffloadPct: action.p2pOffloadPct,
    };
    default: return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildQualityName(height: number): string {
  if (height >= 1080) return '1080p';
  if (height >= 720)  return '720p';
  if (height >= 480)  return '480p';
  if (height >= 360)  return '360p';
  return `${height}p`;
}

function getBufferedAhead(video: HTMLVideoElement): number {
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      return buffered.end(i) - currentTime;
    }
  }
  return 0;
}

async function fetchNetworkConfig(apiUrl: string, channelId: string): Promise<NetworkConfig> {
  const res = await fetch(`${apiUrl}/api/streaming/config/${channelId}`);
  if (!res.ok) throw new Error('config fetch failed');
  return res.json() as Promise<NetworkConfig>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LOGO_POSITION_CLASSES: Record<LogoPosition, string> = {
  'top-left':     'top-3 left-3',
  'top-right':    'top-3 right-3',
  'bottom-left':  'bottom-14 left-3',
  'bottom-right': 'bottom-14 right-3',
};

export function CastifyPlayer({
  src,
  isLive = false,
  autoplay = false,
  muted = false,
  className,
  contentId,
  channelId,
  p2pEnabled: p2pEnabledProp = true,
  onEvent,
  onStateChange,
  logo,
  logoPosition = 'top-left',
  primaryColor,
  accentColor,
  hideControls = false,
}: CastifyPlayerProps): React.JSX.Element {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const hlsRef       = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevQualityRef = useRef<number>(-1);

  // P2P module refs — tracker is dynamic (bittorrent-tracker has Node.js deps); others are static
  const trackerRef   = useRef<import('@/lib/p2p/tracker').P2PTracker | null>(null);
  const schedulerRef = useRef<CastifyScheduler | null>(null);
  const reporterRef  = useRef<SessionReporter | null>(null);

  const [state, dispatch] = useReducer(reducer, makeInitialState(isLive, muted));
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { onStateChange?.(state); }, [state, onStateChange]);

  // Byte counters for P2P stats — useRef to avoid stale closures in hls event handlers
  const p2pBytesRef = useRef({ fromPeers: 0, fromCdn: 0 });

  // ── Event emitter ──────────────────────────────────────────────────────────

  const emitEvent = useCallback(
    (type: PlayerEvent['type'], data?: Record<string, unknown>) => {
      const event: PlayerEvent = { type, timestamp: Date.now(), data };
      onEvent?.(event);
      // Forward to reporter for counters (if active)
      reporterRef.current?.recordEvent(type, data);
    },
    [onEvent],
  );

  // ── Video element listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const v: HTMLVideoElement = video;

    function onPlay()    { dispatch({ type: 'SET_STATUS', status: 'playing' }); emitEvent('play'); }
    function onPause()   { dispatch({ type: 'SET_STATUS', status: 'paused' });  emitEvent('pause'); }
    function onEnded()   { dispatch({ type: 'SET_STATUS', status: 'ended' });   emitEvent('ended'); }
    function onWaiting() { dispatch({ type: 'SET_STATUS', status: 'buffering' }); emitEvent('buffering_start'); }
    function onCanPlay() { dispatch({ type: 'SET_STATUS', status: v.paused ? 'paused' : 'playing' }); emitEvent('buffering_end'); }
    function onTimeUpdate() {
      dispatch({ type: 'SET_TIME', currentTime: v.currentTime, buffered: getBufferedAhead(v) });
    }
    function onDurationChange() {
      if (Number.isFinite(v.duration)) dispatch({ type: 'SET_DURATION', duration: v.duration });
    }
    function onVolumeChange() {
      dispatch({ type: 'SET_VOLUME', volume: v.volume });
      dispatch({ type: 'SET_MUTED', muted: v.muted });
    }
    function onSeeked() { emitEvent('seek', { time: v.currentTime }); }

    v.addEventListener('play',           onPlay);
    v.addEventListener('pause',          onPause);
    v.addEventListener('ended',          onEnded);
    v.addEventListener('waiting',        onWaiting);
    v.addEventListener('canplay',        onCanPlay);
    v.addEventListener('timeupdate',     onTimeUpdate);
    v.addEventListener('durationchange', onDurationChange);
    v.addEventListener('volumechange',   onVolumeChange);
    v.addEventListener('seeked',         onSeeked);

    return () => {
      v.removeEventListener('play',           onPlay);
      v.removeEventListener('pause',          onPause);
      v.removeEventListener('ended',          onEnded);
      v.removeEventListener('waiting',        onWaiting);
      v.removeEventListener('canplay',        onCanPlay);
      v.removeEventListener('timeupdate',     onTimeUpdate);
      v.removeEventListener('durationchange', onDurationChange);
      v.removeEventListener('volumechange',   onVolumeChange);
      v.removeEventListener('seeked',         onSeeked);
    };
  }, [emitEvent]);

  // ── HLS + P2P initialization ───────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    // Capture as HTMLVideoElement so async closures below see the non-null type
    const v: HTMLVideoElement = video;

    dispatch({ type: 'SET_STATUS', status: 'loading' });

    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

    // Instanciar reporter SÍNCRONAMENTE — antes de cualquier await
    // Así StrictMode no puede destruirlo entre el mount y el MANIFEST_PARSED
    if (contentId && channelId) {
      const reporter = new SessionReporter(contentId, channelId, apiUrl);
      reporterRef.current = reporter;
    }

    // Priorizar hls.js — necesitamos sus eventos para Session Reporter y Scheduler P2P.
    // Chrome/Firefox/Edge soportan hls.js y también responden "maybe" a canPlayType,
    // así que hls.js debe ir primero para no caer en el path nativo por error.
    if (!Hls.isSupported()) {
      if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Solo Safari / iOS — HLS nativo. Reporter no disponible en este path.
        v.src = src;
        v.muted = true;
        if (autoplay) void v.play().catch(() => null);
        return () => { v.src = ''; };
      }
      // Browser no soporta HLS de ninguna forma
      dispatch({ type: 'SET_STATUS', status: 'error' });
      emitEvent('error', { details: 'HLS_NOT_SUPPORTED' });
      return;
    }

    // Destroy previous instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const shouldUseP2P = p2pEnabledProp && !!contentId && !!channelId;

    const hlsConfig: Partial<Hls['config']> = {
      startLevel: -1,
      abrEwmaDefaultEstimate: 500_000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      maxBufferLength:    isLive ? 30 : 60,
      maxMaxBufferLength: isLive ? 60 : 600,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry:    3,
      fragLoadingMaxRetry:     3,
    };

    // Async init — must run in browser, wrapped to avoid blocking
    let cancelled = false;

    async function initP2PAndHls() {
      let loaderCtor: Hls['config']['loader'] | undefined;

      // 1. P2P — intento independiente; si falla, el reporter ya existe
      if (shouldUseP2P) {
        try {
          const networkConfig = await fetchNetworkConfig(apiUrl, channelId!);

          const { P2PTracker, deriveInfoHash } = await import('@/lib/p2p/tracker');
          const tracker = new P2PTracker();
          trackerRef.current = tracker;

          const announceUrl = process.env['NEXT_PUBLIC_TRACKER_URL'] ?? 'ws://localhost:1337/announce';
          const peerId = crypto.randomUUID();

          await tracker.connect({
            announceUrl,
            infoHash: deriveInfoHash(src, stateRef.current.quality?.height ?? 720),
            peerId,
          });

          const scheduler = new CastifyScheduler(tracker, networkConfig);
          scheduler.setStreamContext({ src, announceUrl, peerId });
          schedulerRef.current = scheduler;
          loaderCtor = scheduler.createLoader();

          dispatch({
            type: 'SET_P2P_STATS',
            p2pEnabled: true,
            peersConnected: 0,
            bytesFromPeers: 0,
            bytesFromCdn: 0,
            p2pOffloadPct: 0,
          });
        } catch (err) {
          // Tracker no disponible — CDN fallback, el reporter sigue corriendo
          console.debug('[CastifyPlayer] P2P init failed (CDN fallback):', err);
        }
      }

      if (cancelled) return;

      // 5. Create hls.js — with SchedulerLoader if available
      const hls = new Hls(loaderCtor ? { ...hlsConfig, loader: loaderCtor } : hlsConfig);
      hlsRef.current = hls;

      // ── Manifest ────────────────────────────────────────────────────────────
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const qualities: QualityLevel[] = data.levels.map((l, i) => ({
          index: i,
          height: l.height,
          bitrate: l.bitrate,
          name: buildQualityName(l.height),
        }));
        dispatch({ type: 'SET_QUALITIES', qualities, current: qualities[hls.currentLevel] ?? null });

        // Start reporter — independiente del éxito de autoplay
        reporterRef.current?.start(() => stateRef.current);

        if (autoplay) {
          v.muted = true;
          void v.play().catch(() => null);
        }
      });

      // ── Quality ─────────────────────────────────────────────────────────────
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const level = hls.levels[data.level];
        if (!level) return;
        const quality: QualityLevel = {
          index: data.level,
          height: level.height,
          bitrate: level.bitrate,
          name: buildQualityName(level.height),
        };
        dispatch({ type: 'SET_QUALITY', quality });
        emitEvent('quality_change', { from: prevQualityRef.current, to: data.level, manual: false });
        prevQualityRef.current = data.level;
        // Notify scheduler — invalidates the peer swarm for the old quality
        schedulerRef.current?.onQualityChange(level.height);
      });

      // ── Segments ─────────────────────────────────────────────────────────────
      hls.on(Hls.Events.FRAG_BUFFERED, (_e, data) => {
        const level = hls.levels[data.frag.level];
        const w = window as Window & { __castifyLastSegmentSource?: string };
        const source = w.__castifyLastSegmentSource ?? 'cdn';
        w.__castifyLastSegmentSource = undefined;

        // Update P2P byte counters
        const sizeBytes = data.stats.loaded;
        if (source === 'peer') {
          p2pBytesRef.current.fromPeers += sizeBytes;
        } else {
          p2pBytesRef.current.fromCdn += sizeBytes;
        }

        if (schedulerRef.current) {
          const { fromPeers, fromCdn } = p2pBytesRef.current;
          const total = fromPeers + fromCdn;
          dispatch({
            type: 'SET_P2P_STATS',
            p2pEnabled: true,
            peersConnected: trackerRef.current?.getAvailablePeers().length ?? 0,
            bytesFromPeers: fromPeers,
            bytesFromCdn: fromCdn,
            p2pOffloadPct: total > 0 ? Math.round((fromPeers / total) * 100) : 0,
          });
        }

        emitEvent('segment_loaded', {
          url:       data.frag.url,
          source,
          latencyMs: data.stats.loading.end - data.stats.loading.start,
          sizeBytes,
          quality:   level ? buildQualityName(level.height) : 'unknown',
        });
      });

      // ── Buffer ───────────────────────────────────────────────────────────────
      hls.on(Hls.Events.BUFFER_APPENDING, () => {
        dispatch({ type: 'SET_STATUS', status: 'buffering' });
        emitEvent('buffering_start');
      });
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        if (!v.paused) {
          dispatch({ type: 'SET_STATUS', status: 'playing' });
          emitEvent('buffering_end');
        }
      });

      // ── Errors ───────────────────────────────────────────────────────────────
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
              dispatch({ type: 'SET_STATUS', status: 'error' });
              emitEvent('error', { type: data.type, details: data.details });
            } else {
              hls.startLoad();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            dispatch({ type: 'SET_STATUS', status: 'error' });
            emitEvent('error', { type: data.type, details: data.details });
        }
      });

      hls.loadSource(src);
      hls.attachMedia(v);

      // ── NIS config refresh every 5 minutes ───────────────────────────────────
      let configRefreshInterval: ReturnType<typeof setInterval> | null = null;
      if (shouldUseP2P && channelId) {
        configRefreshInterval = setInterval(() => {
          fetchNetworkConfig(apiUrl, channelId)
            .then((cfg) => schedulerRef.current?.updateNetworkConfig(cfg))
            .catch(() => null);
        }, 5 * 60 * 1000);
      }

      // Store cleanup ref
      (hlsRef as React.MutableRefObject<Hls & { _configRefreshInterval?: ReturnType<typeof setInterval> }>)
        .current!._configRefreshInterval = configRefreshInterval ?? undefined;
    }

    void initP2PAndHls();

    // ── Cleanup — CRITICAL: reporter → tracker → hls, in that order ──────────
    return () => {
      cancelled = true;
      p2pBytesRef.current = { fromPeers: 0, fromCdn: 0 };

      reporterRef.current?.stop();
      reporterRef.current = null;

      trackerRef.current?.destroy();
      trackerRef.current = null;

      schedulerRef.current = null;

      const hls = hlsRef.current as (Hls & { _configRefreshInterval?: ReturnType<typeof setInterval> }) | null;
      if (hls) {
        if (hls._configRefreshInterval) clearInterval(hls._configRefreshInterval);
        hls.destroy();
        hlsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isLive, autoplay]);

  // ── Control handlers ───────────────────────────────────────────────────────

  function handlePlay()  { void videoRef.current?.play(); }
  function handlePause() { videoRef.current?.pause(); }
  function handleSeek(time: number) {
    if (videoRef.current) videoRef.current.currentTime = time;
  }
  function handleVolumeChange(volume: number) {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    videoRef.current.muted = volume === 0;
  }
  function handleMuteToggle() {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
  }
  function handleQualityChange(index: number) {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    const level = index >= 0 ? hls.levels[index] : null;
    const quality: QualityLevel | null = level
      ? { index, height: level.height, bitrate: level.bitrate, name: buildQualityName(level.height) }
      : null;
    dispatch({ type: 'SET_QUALITY', quality });
    emitEvent('quality_change', { from: prevQualityRef.current, to: index, manual: true });
    prevQualityRef.current = index;
    schedulerRef.current?.onQualityChange(level?.height ?? 0);
  }

  // ── Overlays ───────────────────────────────────────────────────────────────

  const { status } = state;

  const colorVars = {
    ...(primaryColor ? { '--castify-primary': primaryColor } : {}),
    ...(accentColor  ? { '--castify-accent':  accentColor  } : {}),
  } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full aspect-video bg-black rounded-xl overflow-hidden group', className)}
      style={colorVars}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Logo overlay */}
      {logo && (
        <div className={cn('absolute pointer-events-none', LOGO_POSITION_CLASSES[logoPosition])}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Logo" className="h-8 w-auto max-w-[120px] object-contain opacity-90" />
        </div>
      )}

      {/* EN VIVO badge */}
      {isLive && status === 'playing' && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-semibold text-white tracking-wide">EN VIVO</span>
        </div>
      )}

      {/* Overlay: loading / idle */}
      {(status === 'loading' || status === 'idle') && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
        </div>
      )}

      {/* Overlay: buffering */}
      {status === 'buffering' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span className="text-sm text-white/70">Bufferizando...</span>
          </div>
        </div>
      )}

      {/* Overlay: error */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-zinc-500" />
              <p className="text-white font-medium">Sin señal</p>
            </div>
            <p className="text-white/50 text-xs">El stream no está disponible en este momento</p>
            <button
              aria-label="Reintentar"
              onClick={() => {
                const hls = hlsRef.current;
                const vid = videoRef.current;
                if (!hls || !vid) return;
                dispatch({ type: 'SET_STATUS', status: 'loading' });
                hls.loadSource(src);
                hls.attachMedia(vid);
              }}
              className="text-xs text-white/60 underline hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      {!hideControls && (
        <PlayerControls
          state={state}
          containerRef={containerRef}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onQualityChange={handleQualityChange}
        />
      )}
    </div>
  );
}
