'use client'

import React, { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

export const MIN_CLIP_SEC = 15
export const MAX_CLIP_SEC = 600

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TimelineScrubberProps {
  duration: number      // total video length in seconds
  inPoint: number       // IN marker position (seconds)
  outPoint: number      // OUT marker position (seconds)
  currentTime: number   // playhead position (seconds)
  onInPointChange: (t: number) => void
  onOutPointChange: (t: number) => void
  onSeek: (t: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  disabled?: boolean
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineScrubber({
  duration,
  inPoint,
  outPoint,
  currentTime,
  onInPointChange,
  onOutPointChange,
  onSeek,
  onDragStart,
  onDragEnd,
  disabled,
  className,
}: TimelineScrubberProps) {
  const barRef     = useRef<HTMLDivElement>(null)
  const dragging   = useRef<'in' | 'out' | 'seek' | null>(null)

  // Keep latest values accessible in pointer event handlers without stale closures
  const latest = useRef({ duration, inPoint, outPoint })
  useLayoutEffect(() => { latest.current = { duration, inPoint, outPoint } })

  // ── Coordinate conversion ─────────────────────────────────────────────────

  function toSec(clientX: number): number {
    const bar = barRef.current
    if (!bar || latest.current.duration <= 0) return 0
    const rect = bar.getBoundingClientRect()
    const pct  = clamp((clientX - rect.left) / rect.width, 0, 1)
    return pct * latest.current.duration
  }

  // ── Marker pointer handlers (pointer capture = smooth drag even outside) ──

  function makeMarkerHandlers(marker: 'in' | 'out') {
    return {
      onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (disabled) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragging.current = marker
        onDragStart?.()
      },
      onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (dragging.current !== marker) return
        const { inPoint, outPoint, duration } = latest.current
        const t = toSec(e.clientX)
        if (marker === 'in') {
          onInPointChange(clamp(t, 0, outPoint - MIN_CLIP_SEC))
        } else {
          onOutPointChange(clamp(t, inPoint + MIN_CLIP_SEC, duration))
        }
      },
      onPointerUp() {
        if (dragging.current !== marker) return
        dragging.current = null
        onDragEnd?.()
      },
      onPointerCancel() {
        dragging.current = null
        onDragEnd?.()
      },
    }
  }

  const inHandlers  = makeMarkerHandlers('in')
  const outHandlers = makeMarkerHandlers('out')

  // ── Seek bar handlers ─────────────────────────────────────────────────────

  function handleBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || dragging.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = 'seek'
    onSeek(toSec(e.clientX))
  }

  function handleBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging.current !== 'seek') return
    onSeek(clamp(toSec(e.clientX), 0, latest.current.duration))
  }

  function handleBarPointerUp() {
    dragging.current = null
  }

  // ── Layout values ─────────────────────────────────────────────────────────

  const safe = (n: number) => isFinite(n) ? n : 0
  const inPct   = duration > 0 ? (safe(inPoint)   / duration) * 100 : 0
  const outPct  = duration > 0 ? (safe(outPoint)  / duration) * 100 : 100
  const playPct = duration > 0 ? (safe(currentTime) / duration) * 100 : 0

  const clipDuration = outPoint - inPoint
  const tooShort = clipDuration < MIN_CLIP_SEC
  const tooLong  = clipDuration > MAX_CLIP_SEC
  const valid    = !tooShort && !tooLong

  // Tick marks at 0 / 25 / 50 / 75 / 100 %
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    pct: f * 100,
    label: fmt(f * duration),
  }))

  return (
    <div className={cn('select-none space-y-1', disabled && 'opacity-50 pointer-events-none', className)}>
      {/* Duration summary */}
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-muted-foreground">{fmt(inPoint)}</span>
        <span className={cn('font-semibold', valid ? 'text-green-400' : 'text-destructive')}>
          {fmt(clipDuration)}
          {tooShort && <span className="ml-1 font-normal text-muted-foreground">(mín {MIN_CLIP_SEC}s)</span>}
          {tooLong  && <span className="ml-1 font-normal text-muted-foreground">(máx 10m)</span>}
        </span>
        <span className="text-muted-foreground">{fmt(outPoint)}</span>
      </div>

      {/* Track */}
      <div
        ref={barRef}
        className="relative h-10 touch-none cursor-crosshair"
        onPointerDown={handleBarPointerDown}
        onPointerMove={handleBarPointerMove}
        onPointerUp={handleBarPointerUp}
        onPointerCancel={handleBarPointerUp}
      >
        {/* Background rail */}
        <div className="absolute inset-y-[14px] left-0 right-0 rounded-full bg-muted" />

        {/* Selected region */}
        <div
          className="absolute inset-y-[14px] rounded-sm bg-primary/25 border-y border-primary/40"
          style={{ left: `${inPct}%`, width: `${clamp(outPct - inPct, 0, 100)}%` }}
        />

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-blue-400"
          style={{ left: `${clamp(playPct, 0, 100)}%` }}
        >
          <div className="absolute -top-0.5 -translate-x-1/2 h-3 w-3 rounded-full bg-blue-400 ring-2 ring-background shadow" />
          <div className="absolute bottom-0 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-blue-400 ring-2 ring-background shadow" />
        </div>

        {/* ── IN marker (green, left edge) ─────────────────────────────────── */}
        <div
          {...inHandlers}
          className="absolute top-0 bottom-0 z-20 flex cursor-ew-resize touch-none items-center"
          style={{ left: `${inPct}%` }}
        >
          <div className="group relative flex h-8 w-3 items-center justify-center rounded-l-sm bg-green-500 shadow-md transition-colors hover:bg-green-400 active:bg-green-300">
            <div className="h-4 w-px rounded-full bg-white/70" />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full mb-1.5 left-0 whitespace-nowrap rounded bg-green-700 px-2 py-0.5 text-[10px] font-mono text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
              IN&nbsp;{fmt(inPoint)}
            </div>
            {/* Triangle pointer */}
            <div className="pointer-events-none absolute -bottom-1 left-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-green-500" />
          </div>
        </div>

        {/* ── OUT marker (red, right edge) ─────────────────────────────────── */}
        <div
          {...outHandlers}
          className="absolute top-0 bottom-0 z-20 flex cursor-ew-resize touch-none items-center justify-end"
          style={{ left: `${outPct}%`, transform: 'translateX(-100%)' }}
        >
          <div className="group relative flex h-8 w-3 items-center justify-center rounded-r-sm bg-red-500 shadow-md transition-colors hover:bg-red-400 active:bg-red-300">
            <div className="h-4 w-px rounded-full bg-white/70" />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full mb-1.5 right-0 whitespace-nowrap rounded bg-red-700 px-2 py-0.5 text-[10px] font-mono text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
              OUT&nbsp;{fmt(outPoint)}
            </div>
            <div className="pointer-events-none absolute -bottom-1 right-0 h-0 w-0 border-r-[6px] border-t-[6px] border-r-transparent border-t-red-500" />
          </div>
        </div>
      </div>

      {/* Tick labels */}
      <div className="relative h-4">
        {ticks.map(({ pct, label }) => (
          <div
            key={pct}
            className="absolute flex flex-col items-center gap-0.5"
            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-1 w-px bg-muted-foreground/30" />
            <span className="text-[9px] font-mono text-muted-foreground/50">{label}</span>
          </div>
        ))}
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-muted-foreground/50 text-right">
        <kbd className="font-mono">I</kbd> = marcar inicio&ensp;
        <kbd className="font-mono">O</kbd> = marcar fin&ensp;
        <kbd className="font-mono">Space</kbd> = play/pause
      </p>
    </div>
  )
}
