'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';
import type { PlayerEvent, PlayerState, QualityLevel } from '@castify/types';
import { PlayerControls } from './player-controls';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CastifyPlayerProps {
  src: string;
  isLive?: boolean;
  autoplay?: boolean;
  muted?: boolean;
  className?: string;
  /** Hook para el Scheduler P2P (Prompt 05) */
  onEvent?: (event: PlayerEvent) => void;
  /** Hook para el SessionReporter (Prompt 05) */
  onStateChange?: (state: PlayerState) => void;
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
  | { type: 'SET_LIVE'; isLive: boolean };

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
    p2pEnabled: false,    // Prompt 05: el Scheduler activa esto
    bytesFromPeers: 0,    // Prompt 05: el Scheduler actualiza esto
    bytesFromCdn: 0,      // Prompt 05: el Scheduler actualiza esto
  };
}

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'SET_STATUS':     return { ...state, status: action.status };
    case 'SET_TIME':       return { ...state, currentTime: action.currentTime, buffered: action.buffered };
    case 'SET_DURATION':   return { ...state, duration: action.duration };
    case 'SET_QUALITIES':  return { ...state, availableQualities: action.qualities, quality: action.current };
    case 'SET_QUALITY':    return { ...state, quality: action.quality };
    case 'SET_VOLUME':     return { ...state, volume: action.volume };
    case 'SET_MUTED':      return { ...state, muted: action.muted };
    case 'SET_LIVE':       return { ...state, isLive: action.isLive };
    default:               return state;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function CastifyPlayer({
  src,
  isLive = false,
  autoplay = false,
  muted = false,
  className,
  onEvent,
  onStateChange,
}: CastifyPlayerProps): React.JSX.Element {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const hlsRef      = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevQualityRef = useRef<number>(-1);

  const [state, dispatch] = useReducer(reducer, makeInitialState(isLive, muted));
  const stateRef = useRef(state);

  // Keep stateRef in sync for use inside callbacks
  useEffect(() => { stateRef.current = state; }, [state]);

  // Notify parent on every state change
  useEffect(() => { onStateChange?.(state); }, [state, onStateChange]);

  // ── Event emitter ──────────────────────────────────────────────────────────

  const emitEvent = useCallback(
    (type: PlayerEvent['type'], data?: Record<string, unknown>) => {
      onEvent?.({ type, timestamp: Date.now(), data });
    },
    [onEvent],
  );

  // ── Video element listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Capture as HTMLVideoElement so closures below see the narrowed type
    const v: HTMLVideoElement = video;

    function onPlay()   { dispatch({ type: 'SET_STATUS', status: 'playing' }); emitEvent('play'); }
    function onPause()  { dispatch({ type: 'SET_STATUS', status: 'paused' });  emitEvent('pause'); }
    function onEnded()  { dispatch({ type: 'SET_STATUS', status: 'ended' });   emitEvent('ended'); }
    function onWaiting(){ dispatch({ type: 'SET_STATUS', status: 'buffering' }); emitEvent('buffering_start'); }
    function onCanPlay(){ dispatch({ type: 'SET_STATUS', status: v.paused ? 'paused' : 'playing' }); emitEvent('buffering_end'); }
    function onTimeUpdate() {
      dispatch({ type: 'SET_TIME', currentTime: v.currentTime, buffered: getBufferedAhead(v) });
    }
    function onDurationChange() {
      if (Number.isFinite(v.duration)) {
        dispatch({ type: 'SET_DURATION', duration: v.duration });
      }
    }
    function onVolumeChange() {
      dispatch({ type: 'SET_VOLUME', volume: v.volume });
      dispatch({ type: 'SET_MUTED', muted: v.muted });
    }
    function onSeeked() {
      emitEvent('seek', { time: v.currentTime });
    }

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

  // ── HLS initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    dispatch({ type: 'SET_STATUS', status: 'loading' });

    // Safari / iOS — native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      if (autoplay) void video.play();
      return () => { video.src = ''; };
    }

    if (!Hls.isSupported()) {
      dispatch({ type: 'SET_STATUS', status: 'error' });
      emitEvent('error', { details: 'HLS_NOT_SUPPORTED' });
      return;
    }

    // Destroy any previous instance — critical to avoid memory leaks
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const hlsConfig: Partial<Hls['config']> = {
      // ABR
      startLevel: -1,
      abrEwmaDefaultEstimate: 500_000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      // Buffer
      maxBufferLength:    isLive ? 30 : 60,
      maxMaxBufferLength: isLive ? 60 : 600,
      liveSyncDurationCount:        3,
      liveMaxLatencyDurationCount:  10,
      // Retry
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry:    3,
      fragLoadingMaxRetry:     3,
      // Prompt 05: loader: SchedulerLoader  ← el Scheduler reemplaza el loader aquí
    };

    const hls = new Hls(hlsConfig);
    hlsRef.current = hls;

    // ── Manifest ──────────────────────────────────────────────────────────────

    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const qualities: QualityLevel[] = data.levels.map((l, i) => ({
        index: i,
        height: l.height,
        bitrate: l.bitrate,
        name: buildQualityName(l.height),
      }));
      dispatch({ type: 'SET_QUALITIES', qualities, current: qualities[hls.currentLevel] ?? null });
      if (autoplay) void video.play();
    });

    // ── Quality / Level ───────────────────────────────────────────────────────

    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
      const levels = hls.levels;
      const level  = levels[data.level];
      if (!level) return;
      const quality: QualityLevel = {
        index:   data.level,
        height:  level.height,
        bitrate: level.bitrate,
        name:    buildQualityName(level.height),
      };
      dispatch({ type: 'SET_QUALITY', quality });
      emitEvent('quality_change', {
        from:     prevQualityRef.current,
        to:       data.level,
        manual:   false,  // el Scheduler diferencia manual vs automático
      });
      prevQualityRef.current = data.level;
    });

    // ── Segments — punto de conexión del Scheduler ───────────────────────────
    // Prompt 05: el SchedulerLoader llama onEvent('segment_loaded') con source:'peer'|'cdn'
    // Por ahora todos los segmentos vienen de CDN
    // Usamos FRAG_BUFFERED porque tiene stats.loading con timing y stats.loaded con bytes

    hls.on(Hls.Events.FRAG_BUFFERED, (_e, data) => {
      const level = hls.levels[data.frag.level];
      emitEvent('segment_loaded', {
        url:       data.frag.url,
        source:    'cdn',    // Prompt 05: el Scheduler sobreescribe con 'peer' si aplica
        latencyMs: data.stats.loading.end - data.stats.loading.start,
        sizeBytes: data.stats.loaded,
        quality:   level ? buildQualityName(level.height) : 'unknown',
      });
    });

    // ── Buffer events ─────────────────────────────────────────────────────────

    hls.on(Hls.Events.BUFFER_APPENDING, () => {
      dispatch({ type: 'SET_STATUS', status: 'buffering' });
      emitEvent('buffering_start');
    });

    hls.on(Hls.Events.BUFFER_APPENDED, () => {
      // Only clear buffering if video is already playing
      if (!video.paused) {
        dispatch({ type: 'SET_STATUS', status: 'playing' });
        emitEvent('buffering_end');
      }
    });

    // ── Errors ────────────────────────────────────────────────────────────────

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          // For live streams: keep retrying (stream may resume)
          // MANIFEST_LOAD_ERROR → sin señal
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
    hls.attachMedia(video);

    // ── Cleanup — CRITICAL: always destroy to avoid memory leaks ──────────────
    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [src, isLive, autoplay, emitEvent]);

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
    hls.currentLevel = index;  // -1 = auto ABR
    const level = index >= 0 ? hls.levels[index] : null;
    const quality: QualityLevel | null = level
      ? { index, height: level.height, bitrate: level.bitrate, name: buildQualityName(level.height) }
      : null;
    dispatch({ type: 'SET_QUALITY', quality });
    emitEvent('quality_change', { from: prevQualityRef.current, to: index, manual: true });
    prevQualityRef.current = index;
  }

  // ── Overlays ───────────────────────────────────────────────────────────────

  const { status } = state;

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full aspect-video bg-black rounded-xl overflow-hidden group', className)}
    >
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        className="w-full h-full object-contain"
      />

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
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
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
                const video = videoRef.current;
                if (!hls || !video) return;
                dispatch({ type: 'SET_STATUS', status: 'loading' });
                hls.loadSource(src);
                hls.attachMedia(video);
              }}
              className="text-xs text-white/60 underline hover:text-white transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
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
    </div>
  );
}
