'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';

interface CastifyPlayerProps {
  src: string;
  autoplay?: boolean;
  muted?: boolean;
  className?: string;
}

type PlayerState = 'loading' | 'playing' | 'error';

export function CastifyPlayer({
  src,
  autoplay = false,
  muted = false,
  className,
}: CastifyPlayerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>('loading');

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setState('loading');

    function destroyHls(): void {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }

    // Safari / iOS soportan HLS nativo
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('canplay', () => setState('playing'), { once: true });
      video.addEventListener('error', () => setState('error'), { once: true });
      if (autoplay) void video.play();
      return () => {
        video.src = '';
      };
    }

    // Otros browsers: usar hls.js
    if (!Hls.isSupported()) {
      setState('error');
      return;
    }

    destroyHls();

    const hls = new Hls({
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
      enableWorker: true,
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setState('playing');
      if (autoplay) void video.play();
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setState('error');
        } else {
          hls.startLoad();
        }
      }
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      destroyHls();
    };
  }, [src, autoplay]);

  return (
    <div className={cn('relative w-full aspect-video bg-black rounded-xl overflow-hidden', className)}>
      <video
        ref={videoRef}
        controls
        muted={muted}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Overlay: cargando */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <span className="text-sm text-white/70">Cargando stream...</span>
          </div>
        </div>
      )}

      {/* Overlay: sin señal */}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-1">
            <p className="text-white font-medium">Sin señal</p>
            <p className="text-white/50 text-xs">El stream no está disponible en este momento</p>
          </div>
        </div>
      )}
    </div>
  );
}
