'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import Hls from 'hls.js'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Public handle ─────────────────────────────────────────────────────────────

export interface VideoPreviewHandle {
  seekTo: (sec: number) => void
  play: () => Promise<void>
  pause: () => void
  getCurrentTime: () => number
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClipVideoPreviewProps {
  src: string | null
  isLive?: boolean
  onTimeUpdate?: (t: number) => void
  onDurationChange?: (d: number) => void
  onPlayStateChange?: (playing: boolean) => void
  className?: string
}

// ── Helper ────────────────────────────────────────────────────────────────────

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ClipVideoPreview = forwardRef<VideoPreviewHandle, ClipVideoPreviewProps>(
  function ClipVideoPreview(
    { src, isLive, onTimeUpdate, onDurationChange, onPlayStateChange, className },
    ref,
  ) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const hlsRef   = useRef<Hls | null>(null)

    const [playing, setPlaying]         = useState(false)
    const [volume, setVolume]           = useState(0.7)
    const [muted, setMuted]             = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration]       = useState(0)
    const [ready, setReady]             = useState(false)

    // ── Imperative handle ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      seekTo(sec) {
        const v = videoRef.current
        if (v && !isLive) v.currentTime = Math.max(0, Math.min(sec, v.duration || Infinity))
      },
      async play() {
        await videoRef.current?.play()
      },
      pause() {
        videoRef.current?.pause()
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? 0
      },
    }))

    // ── HLS init ──────────────────────────────────────────────────────────────

    useEffect(() => {
      const video = videoRef.current
      setReady(false)
      setCurrentTime(0)
      setDuration(0)
      setPlaying(false)

      if (!video || !src) return

      // Destroy any previous HLS instance
      hlsRef.current?.destroy()
      hlsRef.current = null

      const isHlsUrl = src.includes('.m3u8')

      if (isHlsUrl && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: !!isLive,
          startLevel: 0, // prefer lowest quality for preview
        })
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setReady(true)
          if (isLive) void video.play()
        })
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) setReady(false)
        })
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari)
        video.src = src
        video.load()
        setReady(true)
      } else {
        video.src = src
        video.load()
        setReady(true)
      }

      return () => {
        hlsRef.current?.destroy()
        hlsRef.current = null
      }
    }, [src, isLive])

    // Sync volume changes
    useEffect(() => {
      if (videoRef.current) videoRef.current.volume = volume
    }, [volume])

    // ── Video event handlers ──────────────────────────────────────────────────

    function handleTimeUpdate() {
      const t = videoRef.current?.currentTime ?? 0
      setCurrentTime(t)
      onTimeUpdate?.(t)
    }

    function handleDurationChange() {
      const d = videoRef.current?.duration ?? 0
      if (isFinite(d) && d > 0) {
        setDuration(d)
        onDurationChange?.(d)
      }
    }

    function handlePlay()  { setPlaying(true);  onPlayStateChange?.(true) }
    function handlePause() { setPlaying(false); onPlayStateChange?.(false) }

    // ── Controls ──────────────────────────────────────────────────────────────

    function togglePlay() {
      const v = videoRef.current
      if (!v) return
      if (playing) v.pause(); else void v.play()
    }

    function toggleMute() {
      const v = videoRef.current
      if (!v) return
      v.muted = !muted
      setMuted(!muted)
    }

    function handleVolumeChange(vals: number[]) {
      const v = vals[0] ?? 0.7
      if (videoRef.current) videoRef.current.volume = v
      setVolume(v)
      if (muted && v > 0) {
        setMuted(false)
        if (videoRef.current) videoRef.current.muted = false
      }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <div className={cn('space-y-2', className)}>
        {/* Video */}
        <div
          className="relative aspect-video cursor-pointer overflow-hidden rounded-lg bg-black"
          onClick={ready ? togglePlay : undefined}
        >
          {/* Empty state */}
          {!src && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Seleccioná un contenido para previsualizar
            </div>
          )}

          {/* LIVE badge */}
          {isLive && src && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              EN DIRECTO
            </div>
          )}

          {/* Play overlay */}
          {!playing && src && ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-110">
                <Play className="ml-1 h-6 w-6 fill-white text-white" />
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onLoadedMetadata={handleDurationChange}
            onPlay={handlePlay}
            onPause={handlePause}
            playsInline
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={togglePlay}
            disabled={!ready}
          >
            {playing
              ? <Pause className="h-4 w-4" />
              : <Play  className="h-4 w-4" />}
          </Button>

          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {fmt(currentTime)}&thinsp;/&thinsp;{isLive ? '∞' : fmt(duration)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={toggleMute}
              disabled={!ready}
            >
              {muted || volume === 0
                ? <VolumeX className="h-3.5 w-3.5" />
                : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            <Slider
              value={[muted ? 0 : volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={1}
              step={0.02}
              className="w-20"
              disabled={!ready}
            />
          </div>
        </div>
      </div>
    )
  },
)
