'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Content } from '@castify/types'
import type { Clip } from '@/lib/api'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Film,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Share2,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClipCreateModal } from './clip-create-modal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  if (m === 0) return `${s}s`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

const STATUS_CONFIG = {
  processing: {
    label: 'Procesando',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    className: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  },
  ready: {
    label: 'Listo',
    icon: <CheckCircle className="h-3 w-3" />,
    className: 'text-green-400 border-green-500/40 bg-green-500/10',
  },
  failed: {
    label: 'Falló',
    icon: <XCircle className="h-3 w-3" />,
    className: 'text-destructive border-destructive/40 bg-destructive/10',
  },
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  youtube: { label: 'YT Shorts', color: 'text-red-400' },
  tiktok:  { label: 'TikTok',    color: 'text-sky-400' },
  twitter: { label: 'X',         color: 'text-blue-400' },
}

// ── ClipsGallery ──────────────────────────────────────────────────────────────

interface ClipsGalleryProps {
  contents: Content[]
}

export function ClipsGallery({ contents }: ClipsGalleryProps) {
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [filterContent, setFilterContent] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [preselectedContent, setPreselectedContent] = useState<Content | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setClips(await api.clips.list())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Poll clips that are still processing
  useEffect(() => {
    const processing = clips.filter((c) => c.status === 'processing')
    if (processing.length === 0) return
    const id = setInterval(async () => {
      const updated = await api.clips.list().catch(() => null)
      if (updated) setClips(updated)
    }, 3000)
    return () => clearInterval(id)
  }, [clips])

  const filtered = clips.filter((c) => {
    if (filterContent !== 'all' && c.contentId !== filterContent) return false
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    return true
  })

  async function handleDelete(clipId: string) {
    await api.clips.delete(clipId).catch(() => null)
    setClips((prev) => prev.filter((c) => c.id !== clipId))
  }

  function openCreateFor(content: Content | null) {
    setPreselectedContent(content)
    setModalOpen(true)
  }

  const processingCount = clips.filter((c) => c.status === 'processing').length

  return (
    <>
      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Scissors className="h-4 w-4" />} label="Total clips" value={clips.length} />
        <StatCard icon={<CheckCircle className="h-4 w-4 text-green-400" />} label="Listos" value={clips.filter(c => c.status === 'ready').length} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-blue-400" />} label="Views totales" value={clips.reduce((a, c) => a + c.views, 0)} />
        <StatCard icon={<Share2 className="h-4 w-4 text-purple-400" />} label="Publicados" value={clips.filter(c => (c.platforms ?? []).length > 0).length} />
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Content filter */}
        <Select value={filterContent} onValueChange={setFilterContent}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todo el contenido" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo el contenido</SelectItem>
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

        {/* Status filter */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ready">Listos</SelectItem>
            <SelectItem value="processing">Procesando</SelectItem>
            <SelectItem value="failed">Fallidos</SelectItem>
          </SelectContent>
        </Select>

        {processingCount > 0 && (
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/40 bg-yellow-500/10 gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {processingCount} procesando…
          </Badge>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button onClick={() => openCreateFor(null)} className="gap-2">
            <Plus className="h-4 w-4" />
            Crear clip
          </Button>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasClips={clips.length > 0}
          contents={contents}
          onCreate={() => openCreateFor(null)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onDelete={() => void handleDelete(clip.id)}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'clip' : 'clips'}
          {(filterContent !== 'all' || filterStatus !== 'all') && ' (filtrado)'}
        </p>
      )}

      {/* ── Create modal ─────────────────────────────────────────────────── */}
      <ClipCreateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setPreselectedContent(null) }}
        onCreated={(clip) => {
          setClips((prev) => [clip, ...prev])
          setModalOpen(false)
          setPreselectedContent(null)
        }}
        contents={contents}
        preselectedContent={preselectedContent}
      />
    </>
  )
}

// ── Clip card ─────────────────────────────────────────────────────────────────

function ClipCard({ clip, onDelete }: { clip: Clip; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const statusCfg = STATUS_CONFIG[clip.status] ?? STATUS_CONFIG.processing
  const platforms = (clip.platforms ?? []) as string[]

  async function copyLink() {
    if (clip.hlsUrl) await navigator.clipboard.writeText(clip.hlsUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className={cn(
      'overflow-hidden group transition-all',
      clip.status === 'processing' && 'opacity-80',
    )}>
      {/* Thumbnail / preview */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt={clip.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Scissors className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className={cn('text-xs gap-1', statusCfg.className)}>
            {statusCfg.icon}
            {statusCfg.label}
          </Badge>
        </div>

        {/* Duration chip */}
        <div className="absolute bottom-2 right-2">
          <span className="rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs text-white font-mono">
            {fmtDuration(clip.durationSec)}
          </span>
        </div>

        {/* Play overlay */}
        {clip.status === 'ready' && clip.hlsUrl && (
          <a
            href={clip.hlsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </a>
        )}

        {/* Processing overlay */}
        {clip.status === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Procesando clip…</span>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={clip.title}>{clip.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{fmtDate(clip.createdAt)}</span>
              {clip.views > 0 && (
                <>
                  <span>·</span>
                  <span>{clip.views} views</span>
                </>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {clip.hlsUrl && (
                <DropdownMenuItem asChild>
                  <a href={clip.hlsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Ver clip
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void copyLink()} disabled={!clip.hlsUrl}>
                <Copy className="h-4 w-4" />
                {copied ? 'Copiado' : 'Copiar enlace'}
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

        {/* Source content */}
        {clip.content?.title && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <Film className="h-3 w-3 shrink-0" />
            {clip.content.title}
          </p>
        )}

        {/* Platform badges */}
        {platforms.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {platforms.map((p) => {
              const cfg = PLATFORM_LABELS[p]
              return cfg ? (
                <Badge key={p} variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', cfg.color)}>
                  {cfg.label}
                </Badge>
              ) : null
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  hasClips,
  contents,
  onCreate,
}: {
  hasClips: boolean
  contents: Content[]
  onCreate: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed py-20 flex flex-col items-center gap-4">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <Scissors className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1 max-w-sm">
        <p className="font-semibold text-base">
          {hasClips ? 'Sin resultados' : 'Todavía no hay clips'}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasClips
            ? 'Ajustá los filtros para ver más clips.'
            : contents.length === 0
              ? 'Primero subí un video o tenés que tener un stream activo.'
              : 'Seleccioná un momento de cualquier stream o VOD y creá tu primer clip.'}
        </p>
      </div>
      {!hasClips && contents.length > 0 && (
        <Button onClick={onCreate} className="gap-2">
          <Scissors className="h-4 w-4" />
          Crear primer clip
        </Button>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
