'use client'

import { useState } from 'react'
import type { EPGEntry } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Clock, Copy, Film, MoreVertical, Pencil, Radio, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatus, fmtTime, fmtDuration, type EntryStatus } from './epg-container'

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<EntryStatus, { label: string; className: string; dot?: string }> = {
  'on-air':    { label: 'En vivo', className: 'text-green-400 border-green-500/40 bg-green-500/10', dot: 'bg-green-400' },
  'scheduled': { label: 'Programado', className: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
  'passed':    { label: 'Finalizado', className: 'text-muted-foreground border-border' },
}

// ── Grid view ─────────────────────────────────────────────────────────────────

interface EpgGridViewProps {
  entries: EPGEntry[]
  now: Date
  onEdit: (entry: EPGEntry) => void
  onDelete: (id: string) => void
  onDuplicate: (entry: EPGEntry) => void
}

type FilterStatus = 'all' | EntryStatus

export function EpgGridView({ entries, now, onEdit, onDelete, onDuplicate }: EpgGridViewProps) {
  const [filter, setFilter] = useState<FilterStatus>('all')

  const filtered = entries.filter((e) => {
    if (filter === 'all') return true
    return getStatus(e, now) === filter
  })

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5">
        {(['all', 'on-air', 'scheduled', 'passed'] as FilterStatus[]).map((f) => {
          const labels: Record<FilterStatus, string> = {
            all: 'Todos',
            'on-air': 'En vivo',
            scheduled: 'Programados',
            passed: 'Finalizados',
          }
          return (
            <Button
              key={f}
              variant={filter === f ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === 'on-air' && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
              )}
              {labels[f]}
              {f !== 'all' && (
                <span className="ml-1 text-muted-foreground">
                  ({entries.filter((e) => getStatus(e, now) === f).length})
                </span>
              )}
            </Button>
          )
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-20 flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Film className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">Sin entradas</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filter === 'all'
                ? 'No hay entradas programadas para este día.'
                : `No hay entradas con estado "${STATUS_BADGE[filter as EntryStatus]?.label}".`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <EpgEntryCard
              key={entry.id}
              entry={entry}
              status={getStatus(entry, now)}
              onEdit={() => onEdit(entry)}
              onDelete={() => onDelete(entry.id)}
              onDuplicate={() => onDuplicate(entry)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'entrada' : 'entradas'}
          {filter !== 'all' && ' (filtrado)'}
        </p>
      )}
    </div>
  )
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EpgEntryCard({
  entry,
  status,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  entry: EPGEntry
  status: EntryStatus
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const badgeCfg = STATUS_BADGE[status]
  const metadata = entry.metadata as Record<string, unknown> | null

  return (
    <Card
      className={cn(
        'overflow-hidden group cursor-pointer transition-all hover:shadow-md',
        status === 'on-air' && 'border-green-500/40',
        status === 'passed' && 'opacity-70',
      )}
      onClick={onEdit}
    >
      {/* Poster / placeholder */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {metadata?.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={String(metadata.posterUrl)}
            alt={entry.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {entry.content ? (
              <Film className="h-8 w-8 text-muted-foreground/40" />
            ) : (
              <Radio className="h-8 w-8 text-muted-foreground/40" />
            )}
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className={cn('text-xs gap-1', badgeCfg.className)}>
            {badgeCfg.dot && (
              <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', badgeCfg.dot)} />
            )}
            {badgeCfg.label}
          </Badge>
        </div>

        {/* Genre chip */}
        {metadata?.genre != null && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex rounded-full bg-black/50 backdrop-blur-sm px-2 py-0.5 text-xs text-white/80">
              {String(metadata.genre)}
            </span>
          </div>
        )}

        {/* On-air glow */}
        {status === 'on-air' && (
          <div className="absolute inset-0 bg-green-500/5 pointer-events-none" />
        )}
      </div>

      {/* Body */}
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug truncate" title={entry.title}>
              {entry.title}
            </p>
            {entry.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {entry.description}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
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

        {/* Time info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{fmtTime(entry.startTime)} – {fmtTime(entry.endTime)}</span>
          <span className="ml-auto">{fmtDuration(entry.duration)}</span>
        </div>

        {/* Content link */}
        {entry.content?.title && (
          <p className="text-xs text-muted-foreground truncate">
            <span className="text-muted-foreground/60">Contenido:</span> {entry.content.title}
          </p>
        )}

        {/* Rating badge */}
        {metadata?.rating != null && (
          <Badge variant="outline" className="text-xs px-1.5 h-4">
            {String(metadata.rating)}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
