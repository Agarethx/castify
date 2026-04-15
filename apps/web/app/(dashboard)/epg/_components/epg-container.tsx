'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { EPGEntry, CreateEPGEntryDto } from '@/lib/api'
import type { Content } from '@castify/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarDays, Grid3x3, List, Plus, RefreshCw } from 'lucide-react'
import { EpgTimelineView } from './epg-timeline-view'
import { EpgGridView } from './epg-grid-view'
import { EpgEntryModal } from './epg-entry-modal'
import { EpgSidebar } from './epg-sidebar'

// ── Shared helpers ────────────────────────────────────────────────────────────

export type EntryStatus = 'scheduled' | 'on-air' | 'passed'

export function getStatus(entry: EPGEntry, now: Date): EntryStatus {
  if (new Date(entry.endTime) < now) return 'passed'
  if (new Date(entry.startTime) <= now && new Date(entry.endTime) >= now) return 'on-air'
  return 'scheduled'
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!
}

// ── EpgContainer ──────────────────────────────────────────────────────────────

type ViewMode = 'timeline' | 'grid'

export function EpgContainer() {
  const [date, setDate] = useState(todayIso())
  const [view, setView] = useState<ViewMode>('timeline')
  const [entries, setEntries] = useState<EPGEntry[]>([])
  const [next24h, setNext24h] = useState<EPGEntry[]>([])
  const [contents, setContents] = useState<Content[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<EPGEntry | null>(null)
  const [duplicateEntry, setDuplicateEntry] = useState<EPGEntry | null>(null)

  // Sidebar highlight
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const [data, sidebar] = await Promise.all([
        api.epg.listByDate(date),
        api.epg.getNext24h(),
      ])
      setEntries(data)
      setNext24h(sidebar)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [date])

  // Load content list once (for the modal selector)
  useEffect(() => {
    api.vod.getMyContents().then(setContents).catch(() => null)
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  // Update "now" every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  function openCreate() {
    setEditEntry(null)
    setDuplicateEntry(null)
    setModalOpen(true)
  }

  function openEdit(entry: EPGEntry) {
    setEditEntry(entry)
    setDuplicateEntry(null)
    setModalOpen(true)
  }

  function openDuplicate(entry: EPGEntry) {
    setEditEntry(null)
    setDuplicateEntry(entry)
    setModalOpen(true)
  }

  async function handleDelete(id: string) {
    try {
      await api.epg.delete(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
      setNext24h((prev) => prev.filter((e) => e.id !== id))
    } catch {
      // silent
    }
  }

  async function handleSave(dto: CreateEPGEntryDto, id?: string) {
    if (id) {
      const updated = await api.epg.update(id, dto)
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)))
      setNext24h((prev) => prev.map((e) => (e.id === id ? updated : e)))
    } else {
      const created = await api.epg.create(dto)
      await loadEntries() // reload to get proper ordering
      void created // satisfy TS
    }
    setModalOpen(false)
    setEditEntry(null)
    setDuplicateEntry(null)
  }

  const isToday = date === todayIso()
  const onAirCount = entries.filter((e) => getStatus(e, now) === 'on-air').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guía de Programación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programá la grilla de contenidos para tus transmisiones
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nueva entrada
        </Button>
      </div>

      {/* ── Main area (controls + content + sidebar) ───────────────────────── */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">

        {/* Controls bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {!isToday && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => setDate(todayIso())}
              >
                Hoy
              </Button>
            )}
          </div>

          {/* Status summary */}
          {!loading && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}
              </Badge>
              {onAirCount > 0 && (
                <Badge variant="outline" className="text-xs text-green-400 border-green-500/40 bg-green-500/10 gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  {onAirCount} en vivo
                </Badge>
              )}
            </div>
          )}

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border bg-muted p-1">
            <button
              onClick={() => setView('timeline')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${view === 'timeline' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="h-3.5 w-3.5" />
              Timeline
            </button>
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${view === 'grid' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              Grid
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => void loadEntries()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* View */}
        {loading ? (
          <LoadingSkeleton view={view} />
        ) : view === 'timeline' ? (
          <EpgTimelineView
            entries={entries}
            now={now}
            date={date}
            highlightId={highlightId}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDuplicate={openDuplicate}
          />
        ) : (
          <EpgGridView
            entries={entries}
            now={now}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDuplicate={openDuplicate}
          />
        )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <EpgSidebar
          entries={next24h}
          now={now}
          onSelect={(id) => {
            setHighlightId(id)
            setView('timeline')
            setTimeout(() => setHighlightId(null), 3000)
          }}
        />
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <EpgEntryModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEntry(null); setDuplicateEntry(null) }}
        onSave={handleSave}
        editEntry={editEntry}
        duplicateEntry={duplicateEntry}
        contents={contents}
        selectedDate={date}
      />
    </div>
  )
}

function LoadingSkeleton({ view }: { view: ViewMode }) {
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="flex">
        <div className="w-16 border-r" />
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
