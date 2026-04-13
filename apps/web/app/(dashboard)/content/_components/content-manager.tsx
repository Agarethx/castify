'use client'

import { useMemo, useState } from 'react'
import type { Content, ContentStatus, ContentType } from '@castify/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VodUploader } from '@/components/castify/vod-uploader'
import {
  Upload,
  Search,
  MoreVertical,
  Play,
  Pencil,
  Trash2,
  Share2,
  Copy,
  ExternalLink,
  Film,
  Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ContentStatus,
  { label: string; dot: string; badge: string }
> = {
  ACTIVE: {
    label: 'En vivo',
    dot: 'bg-red-500 animate-pulse',
    badge: 'border-transparent bg-red-500/15 text-red-400',
  },
  PROCESSING: {
    label: 'Procesando',
    dot: 'bg-yellow-400 animate-pulse',
    badge: 'border-transparent bg-yellow-500/15 text-yellow-400',
  },
  INACTIVE: {
    label: 'Listo',
    dot: 'bg-green-500',
    badge: 'border-transparent bg-green-500/15 text-green-400',
  },
  VOD2LIVE: {
    label: 'VOD2Live',
    dot: 'bg-blue-400 animate-pulse',
    badge: 'border-transparent bg-blue-500/15 text-blue-400',
  },
  ERROR: {
    label: 'Fallido',
    dot: 'bg-zinc-600',
    badge: 'border-transparent bg-zinc-700/50 text-zinc-400',
  },
}

// ── Main component ────────────────────────────────────────────────────────────

interface ContentManagerProps {
  initialContents: Content[]
}

export function ContentManager({ initialContents }: ContentManagerProps) {
  const [contents, setContents] = useState<Content[]>(initialContents)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'ALL'>('ALL')
  const [filterType, setFilterType] = useState<ContentType | 'ALL'>('ALL')
  const [deleting, setDeleting] = useState<string | null>(null)

  // ── Filter + search ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return contents.filter((c) => {
      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false
      if (filterType !== 'ALL' && c.type !== filterType) return false
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [contents, filterStatus, filterType, search])

  function handleUploadComplete(contentId: string, hlsUrl: string) {
    setContents((prev) =>
      prev.map((c) =>
        c.id === contentId ? { ...c, status: 'INACTIVE' as ContentStatus, hlsUrl } : c,
      ),
    )
    setContents((prev) => {
      if (prev.some((c) => c.id === contentId)) return prev
      return [
        {
          id: contentId,
          channelId: '',
          title: 'Video VOD',
          type: 'VOD' as ContentType,
          status: 'INACTIVE' as ContentStatus,
          streamKey: '',
          hlsUrl,
          localPath: null,
          durationSec: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]
    })
    setDialogOpen(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api['fetch']<void>(`/api/channels/me/content/${id}`, { method: 'DELETE' })
      setContents((prev) => prev.filter((c) => c.id !== id))
    } catch {
      // silently ignore
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar contenido…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Status filter */}
        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as ContentStatus | 'ALL')}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="ACTIVE">En vivo</SelectItem>
            <SelectItem value="INACTIVE">Listo</SelectItem>
            <SelectItem value="PROCESSING">Procesando</SelectItem>
            <SelectItem value="VOD2LIVE">VOD2Live</SelectItem>
            <SelectItem value="ERROR">Fallido</SelectItem>
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select
          value={filterType}
          onValueChange={(v) => setFilterType(v as ContentType | 'ALL')}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="LIVE">En vivo</SelectItem>
            <SelectItem value="VOD">VOD</SelectItem>
          </SelectContent>
        </Select>

        {/* Upload button */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Upload className="h-4 w-4" />
              Subir video
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Subir video VOD</DialogTitle>
            </DialogHeader>
            <VodUploader onComplete={handleUploadComplete} />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          hasContents={contents.length > 0}
          onUpload={() => setDialogOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((content) => (
            <ContentCard
              key={content.id}
              content={content}
              deleting={deleting === content.id}
              onDelete={() => void handleDelete(content.id)}
            />
          ))}
        </div>
      )}

      {/* Result count */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'contenido' : 'contenidos'}
          {(search || filterStatus !== 'ALL' || filterType !== 'ALL') && ' (filtrado)'}
        </p>
      )}
    </div>
  )
}

// ── Content card ──────────────────────────────────────────────────────────────

function ContentCard({
  content,
  deleting,
  onDelete,
}: {
  content: Content
  deleting: boolean
  onDelete: () => void
}) {
  const cfg = STATUS_CONFIG[content.status]
  const isLive = content.type === 'LIVE'
  const hasHls = !!content.hlsUrl

  function copyStreamKey() {
    void navigator.clipboard.writeText(content.streamKey)
  }

  function copyHlsUrl() {
    if (content.hlsUrl) void navigator.clipboard.writeText(content.hlsUrl)
  }

  return (
    <Card className={cn('overflow-hidden group transition-all', deleting && 'opacity-50 pointer-events-none')}>
      {/* ── Thumbnail ─────────────────────────────────────────────────────── */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {/* HLS thumbnail via video element snapshot — fallback to placeholder */}
        {hasHls ? (
          <VideoThumbnail hlsUrl={content.hlsUrl!} />
        ) : (
          <ThumbnailPlaceholder isLive={isLive} status={content.status} />
        )}

        {/* Playback overlay */}
        {hasHls && (
          <a
            href={content.hlsUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </a>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2 left-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', cfg.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
        </div>

        {/* Type chip */}
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2 py-0.5 text-xs text-white/80">
            {isLive ? <Radio className="h-3 w-3" /> : <Film className="h-3 w-3" />}
            {isLive ? 'LIVE' : 'VOD'}
          </span>
        </div>

        {/* Processing bar */}
        {content.status === 'PROCESSING' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted">
            <div className="h-full bg-yellow-400 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug truncate" title={content.title}>
              {content.title}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {content.durationSec != null && (
                <span>{formatDuration(content.durationSec)}</span>
              )}
              {content.durationSec != null && <span>·</span>}
              <span>{formatDate(content.createdAt)}</span>
            </div>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {hasHls && (
                <DropdownMenuItem asChild>
                  <a href={content.hlsUrl!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Ver
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={copyStreamKey}>
                <Copy className="h-4 w-4" />
                Copiar stream key
              </DropdownMenuItem>
              {hasHls && (
                <DropdownMenuItem onClick={copyHlsUrl}>
                  <Share2 className="h-4 w-4" />
                  Copiar URL HLS
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`/stream`}>
                  <Pencil className="h-4 w-4" />
                  Configurar stream
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Thumbnail components ──────────────────────────────────────────────────────

function VideoThumbnail({ hlsUrl }: { hlsUrl: string }) {
  const [errored, setErrored] = useState(false)

  // Try to get a poster frame from the HLS URL (SRS exposes a screenshot endpoint)
  const posterUrl = hlsUrl.replace('/hls/', '/api/v1/vhosts/').replace('/index.m3u8', '') + '?screencap'

  if (errored) {
    return <ThumbnailPlaceholder isLive={false} status="INACTIVE" />
  }

  return (
    <img
      src={posterUrl}
      alt="thumbnail"
      className="w-full h-full object-cover"
      onError={() => setErrored(true)}
    />
  )
}

function ThumbnailPlaceholder({
  isLive,
  status,
}: {
  isLive: boolean
  status: ContentStatus
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted/60">
      {status === 'PROCESSING' ? (
        <Skeleton className="h-8 w-8 rounded-full" />
      ) : isLive ? (
        <Radio className="h-8 w-8 text-muted-foreground/40" />
      ) : (
        <Film className="h-8 w-8 text-muted-foreground/40" />
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  hasContents,
  onUpload,
}: {
  hasContents: boolean
  onUpload: () => void
}) {
  return (
    <div className="rounded-xl border border-dashed border-border py-20 flex flex-col items-center gap-4">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Film className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium">
          {hasContents ? 'Sin resultados' : 'No hay contenido aún'}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasContents
            ? 'Probá ajustar los filtros o la búsqueda.'
            : 'Subí tu primer video para empezar.'}
        </p>
      </div>
      {!hasContents && (
        <Button variant="outline" size="sm" onClick={onUpload} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Subir video
        </Button>
      )}
    </div>
  )
}
