'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { Content } from '@castify/types'
import type { Clip } from '@/lib/api'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2,
  Loader2,
  Music,
  PlayCircle,
  Radio,
  Scissors,
  Share2,
  Sparkles,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClipVideoPreview, type VideoPreviewHandle } from './clip-video-preview'
import { TimelineScrubber, MIN_CLIP_SEC, MAX_CLIP_SEC } from './timeline-scrubber'

// ── Platforms ─────────────────────────────────────────────────────────────────

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
  'Esto fue increíble en vivo',
  'El momento que todos esperaban',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClipCreationModalProps {
  open: boolean
  onClose: () => void
  onCreated: (clip: Clip) => void
  contents: Content[]
  preselectedContent: Content | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClipCreationModal({
  open,
  onClose,
  onCreated,
  contents,
  preselectedContent,
}: ClipCreationModalProps) {

  const videoRef = useRef<VideoPreviewHandle>(null)

  // ── Core state ────────────────────────────────────────────────────────────

  const [contentId, setContentId]     = useState<string>('')
  const [mode, setMode]               = useState<'vod' | 'live'>('vod')
  const [videoUrl, setVideoUrl]       = useState<string | null>(null)
  const [duration, setDuration]       = useState(0)
  const [inPoint, setInPoint]         = useState(0)
  const [outPoint, setOutPoint]       = useState(30)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying]     = useState(false)

  // LIVE-mode state
  const [liveStartMs, setLiveStartMs]     = useState<number | null>(null)
  const [liveElapsedSec, setLiveElapsedSec] = useState(0)
  const liveEndSecRef = useRef<number | null>(null) // seconds into stream when end was marked

  // Metadata
  const [title, setTitle]         = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])

  // UI
  const [aiLoading, setAiLoading]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────

  const effectiveContent = preselectedContent
    ?? contents.find((c) => c.id === contentId)
    ?? null

  const effectiveContentId = effectiveContent?.id ?? ''

  const clipDuration = mode === 'vod'
    ? outPoint - inPoint
    : liveElapsedSec

  const canCreate =
    !!effectiveContentId &&
    title.trim().length > 0 &&
    clipDuration >= MIN_CLIP_SEC &&
    clipDuration <= MAX_CLIP_SEC &&
    !submitting

  // ── Sync preselectedContent prop → state ─────────────────────────────────

  useEffect(() => {
    if (preselectedContent) {
      applyContent(preselectedContent)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedContent?.id])

  // ── Live elapsed counter ──────────────────────────────────────────────────

  useEffect(() => {
    if (liveStartMs === null) return
    const id = setInterval(() => {
      setLiveElapsedSec(Math.round((Date.now() - liveStartMs) / 1000))
    }, 500)
    return () => clearInterval(id)
  }, [liveStartMs])

  // ── Keyboard shortcuts (I / O / Space) ───────────────────────────────────

  // Use a ref so the keydown handler always sees latest values
  const shortcutRef = useRef({ isPlaying, mode, currentTime, duration, inPoint, outPoint })
  useLayoutEffect(() => {
    shortcutRef.current = { isPlaying, mode, currentTime, duration, inPoint, outPoint }
  })

  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const { isPlaying, mode, currentTime, duration, inPoint, outPoint } = shortcutRef.current

      if (e.key === ' ') {
        e.preventDefault()
        if (isPlaying) videoRef.current?.pause()
        else void videoRef.current?.play()
      }
      if (e.key.toLowerCase() === 'i' && mode === 'vod') {
        setInPoint(Math.min(currentTime, outPoint - MIN_CLIP_SEC))
      }
      if (e.key.toLowerCase() === 'o' && mode === 'vod') {
        setOutPoint(Math.max(currentTime, inPoint + MIN_CLIP_SEC))
        if (currentTime > duration - 0.5) {
          setOutPoint(duration)
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  // ── Content helpers ───────────────────────────────────────────────────────

  function applyContent(c: Content) {
    const nextMode = c.type === 'LIVE' ? 'live' : 'vod'
    setMode(nextMode)
    setVideoUrl(c.hlsUrl ?? null)
    setDuration(0)
    setInPoint(0)
    setOutPoint(30)
    setCurrentTime(0)
    setIsPlaying(false)
    setLiveStartMs(null)
    setLiveElapsedSec(0)
    liveEndSecRef.current = null
  }

  function handleContentChange(id: string) {
    setContentId(id)
    const c = contents.find((x) => x.id === id)
    if (c) applyContent(c)
  }

  // ── Video callbacks ───────────────────────────────────────────────────────

  function handleDurationChange(d: number) {
    setDuration(d)
    // Default selection: first 30s or whole video if shorter
    setOutPoint(Math.min(d, 30))
  }

  function handleTimeUpdate(t: number) {
    setCurrentTime(t)
  }

  // ── Timeline scrubber drag ────────────────────────────────────────────────

  function handleDragStart() {
    setIsDragging(true)
    videoRef.current?.pause()
  }

  function handleDragEnd() {
    setIsDragging(false)
  }

  const handleInChange = useCallback((t: number) => {
    setInPoint(t)
    videoRef.current?.seekTo(t)
  }, [])

  const handleOutChange = useCallback((t: number) => {
    setOutPoint(t)
    videoRef.current?.seekTo(t)
  }, [])

  const handleSeek = useCallback((t: number) => {
    setCurrentTime(t)
    videoRef.current?.seekTo(t)
  }, [])

  // ── LIVE mode controls ────────────────────────────────────────────────────

  function handleMarkStart() {
    setLiveStartMs(Date.now())
    setLiveElapsedSec(0)
    liveEndSecRef.current = null
    setInPoint(currentTime)
  }

  function handleMarkEnd() {
    liveEndSecRef.current = currentTime
    setLiveStartMs(null) // stop counter
    setOutPoint(currentTime)
  }

  const liveMarked = liveStartMs !== null

  // ── AI title ──────────────────────────────────────────────────────────────

  function handleGenerateTitle() {
    setAiLoading(true)
    setTimeout(() => {
      setTitle(AI_TITLES[Math.floor(Math.random() * AI_TITLES.length)]!)
      setAiLoading(false)
    }, 900)
  }

  // ── Platforms ─────────────────────────────────────────────────────────────

  function togglePlatform(id: string) {
    setPlatforms((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setError(null)

    if (!effectiveContentId) return setError('Seleccioná un contenido.')
    if (!title.trim())        return setError('Ingresá un título para el clip.')

    const startSec = mode === 'vod' ? inPoint : inPoint
    const endSec   = mode === 'vod' ? outPoint : (liveEndSecRef.current ?? currentTime)
    const dur      = endSec - startSec

    if (dur < MIN_CLIP_SEC) return setError(`El clip debe durar al menos ${MIN_CLIP_SEC} segundos.`)
    if (dur > MAX_CLIP_SEC) return setError('El clip no puede durar más de 10 minutos.')

    setSubmitting(true)
    try {
      const clip = await api.clips.create({
        contentId: effectiveContentId,
        title: title.trim(),
        startSec,
        endSec,
        platforms: platforms.length > 0 ? platforms : undefined,
      })
      handleClose()
      onCreated(clip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el clip.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Reset / Close ─────────────────────────────────────────────────────────

  function handleClose() {
    setContentId('')
    setMode('vod')
    setVideoUrl(null)
    setDuration(0)
    setInPoint(0)
    setOutPoint(30)
    setCurrentTime(0)
    setIsPlaying(false)
    setLiveStartMs(null)
    setLiveElapsedSec(0)
    liveEndSecRef.current = null
    setTitle('')
    setPlatforms([])
    setError(null)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4" />
            Crear clip
            {mode === 'live' && (
              <Badge variant="outline" className="ml-1 gap-1 border-red-500/40 bg-red-500/10 text-red-400 text-[10px]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                EN VIVO
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5 mt-4">

          {/* ── Content selector ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Contenido fuente</Label>
            {preselectedContent ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {preselectedContent.type === 'LIVE'
                  ? <Radio className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  : <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="truncate font-medium">{preselectedContent.title}</span>
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px] px-1.5 py-0 h-4">
                  {preselectedContent.type}
                </Badge>
              </div>
            ) : (
              <Select value={contentId} onValueChange={handleContentChange}>
                <SelectTrigger className="overflow-hidden">
                  <SelectValue placeholder="Seleccioná un stream o VOD…" />
                </SelectTrigger>
                <SelectContent>
                  {contents.length === 0 && (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No hay contenido disponible
                    </div>
                  )}
                  {contents.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2 min-w-0">
                        {c.type === 'LIVE'
                          ? <Radio className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          : <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="truncate">{c.title}</span>
                        <Badge variant="outline" className="ml-auto shrink-0 text-[10px] px-1 py-0 h-4">
                          {c.type}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Video preview ─────────────────────────────────────────────── */}
          <ClipVideoPreview
            ref={videoRef}
            src={videoUrl}
            isLive={mode === 'live'}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onPlayStateChange={setIsPlaying}
          />

          {/* ── VOD timeline scrubber ─────────────────────────────────────── */}
          {mode === 'vod' && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Selección del clip</Label>
                  {isDragging && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Ajustando…
                    </span>
                  )}
                </div>
                <TimelineScrubber
                  duration={duration}
                  inPoint={inPoint}
                  outPoint={outPoint}
                  currentTime={currentTime}
                  onInPointChange={handleInChange}
                  onOutPointChange={handleOutChange}
                  onSeek={handleSeek}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  disabled={duration === 0}
                />
              </div>
            </>
          )}

          {/* ── LIVE mode markers ─────────────────────────────────────────── */}
          {mode === 'live' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Marcadores del clip</Label>

                {/* Elapsed counter */}
                {liveMarked && (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                    <Timer className="h-4 w-4 text-orange-400 animate-pulse" />
                    <span className="text-sm font-mono font-medium text-orange-300">
                      Grabando desde hace {fmt(liveElapsedSec)}
                    </span>
                    {liveElapsedSec >= MAX_CLIP_SEC - 30 && (
                      <Badge variant="outline" className="ml-auto text-[10px] border-orange-500/40 text-orange-400">
                        ¡Casi al límite!
                      </Badge>
                    )}
                  </div>
                )}

                {/* Mark buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className={cn(
                      'gap-2 border-green-500/40 transition-colors',
                      liveMarked
                        ? 'bg-green-500/15 text-green-300 border-green-500/60'
                        : 'hover:bg-green-500/10 hover:text-green-400',
                    )}
                    onClick={handleMarkStart}
                    disabled={!videoUrl}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    {liveMarked ? 'Reiniciar inicio' : 'Mark Start'}
                  </Button>

                  <Button
                    variant="outline"
                    className={cn(
                      'gap-2 border-red-500/40 transition-colors',
                      liveEndSecRef.current !== null
                        ? 'bg-red-500/15 text-red-300 border-red-500/60'
                        : 'hover:bg-red-500/10 hover:text-red-400',
                    )}
                    onClick={handleMarkEnd}
                    disabled={!liveMarked}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    {liveEndSecRef.current !== null ? 'Fin marcado ✓' : 'Mark End'}
                  </Button>
                </div>

                {/* Status */}
                {!liveMarked && !liveEndSecRef.current && (
                  <p className="text-xs text-muted-foreground">
                    Presioná <strong>Mark Start</strong> cuando empiece el momento que querés clipear.
                  </p>
                )}
                {liveMarked && !liveEndSecRef.current && (
                  <p className="text-xs text-muted-foreground">
                    Presioná <strong>Mark End</strong> cuando termine, o el botón "Crear clip" captura hasta ahora.
                  </p>
                )}
                {liveEndSecRef.current !== null && (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Clip marcado: {fmt(clipDuration)} seleccionados
                  </div>
                )}

                {/* Over-limit warning */}
                {liveElapsedSec > MAX_CLIP_SEC && (
                  <p className="text-xs text-destructive">
                    Superaste el límite de 10 minutos. Marcá el fin para fijar la selección.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Metadata ──────────────────────────────────────────────────── */}
          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="clip-title">Título del clip</Label>
            <div className="flex gap-2">
              <Input
                id="clip-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre tu clip…"
                className="flex-1"
                maxLength={120}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 px-3"
                onClick={handleGenerateTitle}
                disabled={aiLoading}
              >
                {aiLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 text-yellow-400" />}
                {aiLoading ? 'Generando…' : 'IA'}
              </Button>
            </div>
          </div>

          {/* Platform selector */}
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
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canCreate}
              className="gap-2 min-w-[120px]"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</>
                : <><Scissors className="h-4 w-4" /> Crear clip</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
