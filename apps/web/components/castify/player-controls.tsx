'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PlayerState, QualityLevel } from '@castify/types';

interface PlayerControlsProps {
  state: PlayerState;
  containerRef: React.RefObject<HTMLDivElement>;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onQualityChange: (index: number) => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function qualityLabel(level: QualityLevel): string {
  return level.name || `${level.height}p`;
}

export function PlayerControls({
  state,
  containerRef,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onQualityChange,
}: PlayerControlsProps): React.JSX.Element {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  const handleMouseMove = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', () => setVisible(false));
    el.addEventListener('mouseenter', handleMouseMove);
    scheduleHide();
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', () => setVisible(false));
      el.removeEventListener('mouseenter', handleMouseMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [containerRef, handleMouseMove, scheduleHide]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }

  const isPlaying = state.status === 'playing';
  const progress =
    !state.isLive && state.duration
      ? (state.currentTime / state.duration) * 100
      : 0;

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col justify-end pointer-events-none transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0 sm:opacity-0',
        // Always visible on mobile
        'max-sm:opacity-100',
      )}
    >
      {/* Gradient scrim */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Controls row */}
      <div className="relative pointer-events-auto px-3 pb-3 pt-2 space-y-2">
        {/* Progress bar — VOD only */}
        {!state.isLive && state.duration != null && (
          <Slider
            aria-label="Progreso de reproducción"
            value={[progress]}
            min={0}
            max={100}
            step={0.1}
            onValueChange={([v]) => onSeek(((v ?? 0) / 100) * (state.duration ?? 0))}
            className="w-full cursor-pointer"
          />
        )}

        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            onClick={isPlaying ? onPause : onPlay}
            className="text-white hover:text-white/80 transition-colors"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          {/* Volume */}
          <button
            aria-label={state.muted ? 'Activar sonido' : 'Silenciar'}
            onClick={onMuteToggle}
            className="text-white hover:text-white/80 transition-colors"
          >
            {state.muted || state.volume === 0 ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
          <Slider
            aria-label="Volumen"
            value={[state.muted ? 0 : state.volume * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => onVolumeChange((v ?? 0) / 100)}
            className="w-20 cursor-pointer"
          />

          {/* Time / LIVE badge */}
          <div className="flex-1 px-1">
            {state.isLive ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                EN VIVO
              </span>
            ) : (
              <span className="text-xs text-white/70 font-mono tabular-nums">
                {formatTime(state.currentTime)}
                {state.duration != null && ` / ${formatTime(state.duration)}`}
              </span>
            )}
          </div>

          {/* Quality selector */}
          {state.availableQualities.length > 0 && (
            <Select
              value={state.quality ? String(state.quality.index) : 'auto'}
              onValueChange={(v) => onQualityChange(v === 'auto' ? -1 : Number(v))}
            >
              <SelectTrigger aria-label="Seleccionar calidad" className="h-7 w-auto min-w-[4.5rem]">
                <SelectValue>
                  {state.quality ? qualityLabel(state.quality) : 'Auto'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {state.availableQualities.map((q) => (
                  <SelectItem key={q.index} value={String(q.index)}>
                    {qualityLabel(q)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* P2P badge — placeholder for Prompt 05 */}
          {state.p2pEnabled && (
            <span className="text-xs font-semibold text-green-400 border border-green-500/40 rounded px-1.5 py-0.5">
              P2P
            </span>
          )}

          {/* Fullscreen */}
          <button
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={toggleFullscreen}
            className="text-white hover:text-white/80 transition-colors"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
