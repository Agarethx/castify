'use client'

import { useEffect, useRef } from 'react'
import type { EPGEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatus, fmtTime, fmtDuration, type EntryStatus } from './epg-container'

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 80   // px per hour
const DAY_HEIGHT = HOUR_HEIGHT * 24  // 1920px
const TIME_LABEL_W = 56  // px for time column

function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT
}

function timeToPx(date: Date): number {
  return minutesToPx(date.getHours() * 60 + date.getMinutes())
}

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<EntryStatus, string> = {
  'on-air':   'border-green-500 bg-green-500/10 hover:bg-green-500/15',
  'scheduled':'border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10',
  'passed':   'border-border bg-muted/20 hover:bg-muted/30 opacity-60',
}

const STATUS_BADGE: Record<EntryStatus, { label: string; className: string }> = {
  'on-air':    { label: 'En vivo', className: 'text-green-400 border-green-500/40 bg-green-500/10' },
  'scheduled': { label: 'Programado', className: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
  'passed':    { label: 'Finalizado', className: 'text-muted-foreground border-border' },
}

// ── Timeline view ─────────────────────────────────────────────────────────────

interface EpgTimelineViewProps {
  entries: EPGEntry[]
  now: Date
  date: string
  highlightId: string | null
  onEdit: (entry: EPGEntry) => void
  onDelete: (id: string) => void
  onDuplicate: (entry: EPGEntry) => void
}

export function EpgTimelineView({
  entries,
  now,
  date,
  highlightId,
  onEdit,
  onDelete,
  onDuplicate,
}: EpgTimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const isToday = date === new Date().toISOString().split('T')[0]!

  // On mount, scroll to "now" (or start of day)
  useEffect(() => {
    if (!scrollRef.current) return
    const target = isToday ? Math.max(timeToPx(now) - 160, 0) : 0
    scrollRef.current.scrollTop = target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Scroll to highlighted entry when changed
  useEffect(() => {
    if (highlightId && highlightRef.current && scrollRef.current) {
      const el = highlightRef.current
      const container = scrollRef.current
      container.scrollTop = el.offsetTop - 160
    }
  }, [highlightId])

  const nowTopPx = timeToPx(now)

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col">
      {/* Scrollable timeline body */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[600px]">
        <div className="flex" style={{ height: DAY_HEIGHT }}>

          {/* ── Hour labels column ────────────────────────────────────── */}
          <div
            className="relative border-r bg-muted/20 shrink-0"
            style={{ width: TIME_LABEL_W }}
          >
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="absolute right-0 flex items-start justify-end pr-2"
                style={{ top: h * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* "Now" tick on label column */}
            {isToday && (
              <div
                className="absolute right-0 flex items-center"
                style={{ top: nowTopPx - 1, width: '100%' }}
              >
                <div className="w-full h-[2px] bg-red-500" />
              </div>
            )}
          </div>

          {/* ── Entries column ────────────────────────────────────────── */}
          <div className="relative flex-1 bg-background">
            {/* Hour grid lines */}
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/40"
                style={{ top: h * HOUR_HEIGHT }}
              />
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border/20"
                style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {/* "Now" indicator */}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-20 flex items-center gap-1.5 pointer-events-none"
                style={{ top: nowTopPx - 1 }}
              >
                <div className="h-2 w-2 rounded-full bg-red-500 ml-1 shrink-0" />
                <div className="flex-1 h-[2px] bg-red-500" />
                <span className="text-[10px] font-bold text-red-400 bg-background border border-red-500/40 rounded px-1 mr-1 shrink-0">
                  NOW
                </span>
              </div>
            )}

            {/* Entry blocks */}
            {entries.map((entry) => {
              const startDate = new Date(entry.startTime)
              const topPx = timeToPx(startDate)
              const heightPx = Math.max(minutesToPx(entry.duration), 24)
              const status = getStatus(entry, now)
              const isHighlighted = entry.id === highlightId

              return (
                <div
                  key={entry.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={cn(
                    'absolute left-2 right-2 rounded-lg border transition-all cursor-pointer overflow-hidden',
                    STATUS_STYLES[status],
                    isHighlighted && 'ring-2 ring-primary ring-offset-1',
                  )}
                  style={{ top: topPx + 1, height: heightPx - 2 }}
                  onClick={() => onEdit(entry)}
                >
                  <TimelineEntryContent
                    entry={entry}
                    status={status}
                    heightPx={heightPx}
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDelete(entry.id)}
                    onDuplicate={() => onDuplicate(entry)}
                  />
                </div>
              )
            })}

            {entries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No hay entradas programadas para este día.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Entry block content ───────────────────────────────────────────────────────

function TimelineEntryContent({
  entry,
  status,
  heightPx,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  entry: EPGEntry
  status: EntryStatus
  heightPx: number
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const compact = heightPx < 48
  const badgeCfg = STATUS_BADGE[status]

  return (
    <div className="h-full flex flex-col px-2.5 py-1.5 group">
      <div className="flex items-start justify-between gap-1 min-h-0">
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium leading-tight truncate', compact ? 'text-xs' : 'text-sm')}>
            {entry.title}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtTime(entry.startTime)} – {fmtTime(entry.endTime)}
              <span className="mx-1">·</span>
              {fmtDuration(entry.duration)}
            </p>
          )}
        </div>

        {/* Actions menu — only shown on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-0.5" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status badge + description (only when tall enough) */}
      {heightPx >= 72 && (
        <div className="mt-1 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0 h-4 gap-1', badgeCfg.className)}
          >
            {status === 'on-air' && <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
            {badgeCfg.label}
          </Badge>
          {entry.content?.title && (
            <span className="text-[10px] text-muted-foreground truncate">
              {entry.content.title}
            </span>
          )}
        </div>
      )}

      {heightPx >= 96 && entry.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.description}</p>
      )}
    </div>
  )
}
