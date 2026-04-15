'use client'

import { useState } from 'react'
import type { Content } from '@castify/types'
import type { Clip } from '@/lib/api'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, Scissors, Sparkles, PlayCircle, Share2, Music } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClipCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (clip: Clip) => void
  contents: Content[]
  preselectedContent: Content | null
}

// ── Presets ───────────────────────────────────────────────────────────────────

const DURATION_PRESETS = [
  { label: '15s', sec: 15 },
  { label: '30s', sec: 30 },
  { label: '1m',  sec: 60 },
  { label: '2m',  sec: 120 },
  { label: '5m',  sec: 300 },
  { label: '10m', sec: 600 },
]

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube Shorts', icon: PlayCircle, color: 'text-red-400' },
  { id: 'tiktok',  label: 'TikTok',         icon: Music,      color: 'text-sky-400' },
  { id: 'twitter', label: 'Twitter / X',    icon: Share2,     color: 'text-blue-400' },
]

const AI_TITLES = [
  'El momento más épico del stream',
  'No vas a creer lo que pasó',
  'Clip imperdible de hoy',
  'El highlight del día',
  'Esto fue increíble',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSec(value: string): number {
  const trimmed = value.trim()
  // Accept "m:ss" format
  const mmss = /^(\d+):(\d{1,2})$/.exec(trimmed)
  if (mmss) return parseInt(mmss[1]!, 10) * 60 + parseInt(mmss[2]!, 10)
  const n = parseFloat(trimmed)
  return isNaN(n) ? 0 : n
}

function fmtSec(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ClipCreateModal({
  open,
  onClose,
  onCreated,
  contents,
  preselectedContent,
}: ClipCreateModalProps) {
  const [contentId, setContentId] = useState(preselectedContent?.id ?? '')
  const [startSec, setStartSec]   = useState('0')
  const [endSec, setEndSec]       = useState('30')
  const [title, setTitle]         = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [aiLoading, setAiLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Sync content if preselectedContent changes while modal opens
  const effectiveContentId = preselectedContent?.id ?? contentId

  const startNum = parseSec(startSec)
  const endNum   = parseSec(endSec)
  const duration = endNum - startNum

  const selectedContent = contents.find((c) => c.id === effectiveContentId)

  function applyPreset(sec: number) {
    const start = startNum
    setEndSec(String(start + sec))
  }

  function togglePlatform(id: string) {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  function mockGenerateTitle() {
    setAiLoading(true)
    setTimeout(() => {
      setTitle(AI_TITLES[Math.floor(Math.random() * AI_TITLES.length)]!)
      setAiLoading(false)
    }, 900)
  }

  function reset() {
    setContentId('')
    setStartSec('0')
    setEndSec('30')
    setTitle('')
    setPlatforms([])
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setError(null)

    if (!effectiveContentId) {
      setError('Seleccioná un contenido.')
      return
    }
    if (duration < 5) {
      setError('El clip debe durar al menos 5 segundos.')
      return
    }
    if (duration > 600) {
      setError('El clip no puede durar más de 10 minutos.')
      return
    }
    if (!title.trim()) {
      setError('Ingresá un título para el clip.')
      return
    }

    setSubmitting(true)
    try {
      const clip = await api.clips.create({
        contentId: effectiveContentId,
        title: title.trim(),
        startSec: startNum,
        endSec: endNum,
        platforms: platforms.length > 0 ? platforms : undefined,
      })
      reset()
      onCreated(clip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el clip.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Crear clip
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Content selector */}
          <div className="space-y-1.5">
            <Label>Contenido fuente</Label>
            {preselectedContent ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/40">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                  {preselectedContent.type}
                </Badge>
                <span className="truncate">{preselectedContent.title}</span>
              </div>
            ) : (
              <Select value={contentId} onValueChange={setContentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná un stream o VOD…" />
                </SelectTrigger>
                <SelectContent>
                  {contents.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">[{c.type}]</span>
                        {c.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          {/* Time range */}
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="startSec">Inicio (segundos)</Label>
                <Input
                  id="startSec"
                  value={startSec}
                  onChange={(e) => setStartSec(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="endSec">Fin (segundos)</Label>
                <Input
                  id="endSec"
                  value={endSec}
                  onChange={(e) => setEndSec(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>

            {/* Duration presets */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Presets de duración</p>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => applyPreset(p.sec)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {duration > 0 && (
              <p className={cn(
                'text-xs',
                duration < 5 || duration > 600 ? 'text-destructive' : 'text-muted-foreground',
              )}>
                Duración: {fmtSec(duration)}
                {duration > 600 && ' — máximo 10 minutos'}
                {duration < 5 && duration > 0 && ' — mínimo 5 segundos'}
              </p>
            )}
          </div>

          <Separator />

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="clip-title">Título del clip</Label>
            <div className="flex gap-2">
              <Input
                id="clip-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre tu clip…"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={mockGenerateTitle}
                disabled={aiLoading}
                className="shrink-0 gap-1.5 px-3"
              >
                {aiLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 text-yellow-400" />}
                {aiLoading ? 'Generando…' : 'IA'}
              </Button>
            </div>
          </div>

          {/* Platforms */}
          <div className="space-y-2">
            <Label>Publicar en (opcional)</Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(({ id, label, icon: Icon, color }) => {
                const active = platforms.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePlatform(id)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs transition-colors',
                      active
                        ? 'border-primary/60 bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/40',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? color : '')} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</>
              : <><Scissors className="h-4 w-4" /> Crear clip</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
