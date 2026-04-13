'use client'

import { useState } from 'react'
import type { Content } from '@castify/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BrowserStreamer } from '@/components/castify/browser-streamer'
import { StreamKeyInput } from '@/components/castify/stream-key-input'
import { CopyButton } from '@/components/castify/copy-button'
import { StreamMonitor } from './stream-monitor'
import {
  Webcam,
  Monitor,
  Film,
  CalendarDays,
  Lock,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Settings,
  Eye,
  Share2,
  PlayCircle,
  Camera,
  Music2,
  Gamepad2,
  Globe,
} from 'lucide-react'
import { api } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type IngestMode = 'browser' | 'obs' | 'vod2live' | 'scheduled'
type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE'

interface StreamTabsProps {
  content: Content
  rtmpUrl: string
  vodContents: Content[]
  plan: Plan
  channelId: string
}

// ── Platform definitions ──────────────────────────────────────────────────────

interface PlatformDef {
  id: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'twitch'
  label: string
  icon: React.ReactNode
  color: string
  fields: { key: string; label: string; placeholder: string; type?: string }[]
  soon?: boolean
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <PlayCircle className="h-4 w-4" />,
    color: 'text-red-500',
    fields: [{ key: 'streamKey', label: 'Stream Key', placeholder: 'xxxx-xxxx-xxxx-xxxx' }],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: <Globe className="h-4 w-4" />,
    color: 'text-blue-500',
    fields: [
      { key: 'pageId', label: 'Page ID', placeholder: '123456789' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'EAABx...', type: 'password' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: <Camera className="h-4 w-4" />,
    color: 'text-pink-500',
    fields: [
      { key: 'accountId', label: 'Account ID', placeholder: '123456789' },
      { key: 'accessToken', label: 'Access Token', placeholder: 'EAABx...', type: 'password' },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: <Music2 className="h-4 w-4" />,
    color: 'text-foreground',
    fields: [{ key: 'streamKey', label: 'Stream Key', placeholder: 'live_xxxx' }],
  },
  {
    id: 'twitch',
    label: 'Twitch',
    icon: <Gamepad2 className="h-4 w-4" />,
    color: 'text-purple-500',
    fields: [{ key: 'streamKey', label: 'Stream Key', placeholder: 'live_xxxx' }],
    soon: true,
  },
]

// ── Root component ────────────────────────────────────────────────────────────

export function StreamTabs({ content, rtmpUrl, vodContents, plan, channelId }: StreamTabsProps) {
  const canMultistream = plan === 'PRO' || plan === 'ENTERPRISE'

  return (
    <Tabs defaultValue="ingest" className="space-y-4">
      <TabsList className="w-full justify-start h-auto p-1 gap-0.5">
        <TabsTrigger value="ingest" className="gap-1.5">
          <Webcam className="h-3.5 w-3.5" /> Cómo transmitir
        </TabsTrigger>
        <TabsTrigger value="multistream" className="gap-1.5">
          <Share2 className="h-3.5 w-3.5" /> Multistreaming
          {!canMultistream && <Lock className="h-3 w-3 ml-0.5 opacity-50" />}
        </TabsTrigger>
        <TabsTrigger value="config" className="gap-1.5">
          <Settings className="h-3.5 w-3.5" /> Configuración
        </TabsTrigger>
        <TabsTrigger value="preview" className="gap-1.5">
          <Eye className="h-3.5 w-3.5" /> Preview
        </TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Ingest mode ─────────────────────────────────────────────── */}
      <TabsContent value="ingest">
        <IngestTab content={content} rtmpUrl={rtmpUrl} vodContents={vodContents} />
      </TabsContent>

      {/* ── Tab 2: Multistreaming ──────────────────────────────────────────── */}
      <TabsContent value="multistream">
        {canMultistream ? (
          <MultistreamTab content={content} />
        ) : (
          <UpgradeCard
            title="Multistreaming requiere Plan Pro o Enterprise"
            description="Retransmití en simultáneo a YouTube, Facebook, Instagram y TikTok."
          />
        )}
      </TabsContent>

      {/* ── Tab 3: Config ──────────────────────────────────────────────────── */}
      <TabsContent value="config">
        <ConfigTab />
      </TabsContent>

      {/* ── Tab 4: Preview ─────────────────────────────────────────────────── */}
      <TabsContent value="preview">
        <StreamMonitor
          streamKey={content.streamKey}
          contentId={content.id}
          channelId={channelId}
          initialStatus={content.status}
          initialHlsUrl={content.hlsUrl}
        />
      </TabsContent>
    </Tabs>
  )
}

// ── Tab 1: Ingest ─────────────────────────────────────────────────────────────

function IngestTab({
  content,
  rtmpUrl,
  vodContents,
}: {
  content: Content
  rtmpUrl: string
  vodContents: Content[]
}) {
  const [mode, setMode] = useState<IngestMode>('browser')

  const OPTIONS: { id: IngestMode; icon: React.ReactNode; label: string; description: string }[] = [
    {
      id: 'browser',
      icon: <Webcam className="h-5 w-5" />,
      label: 'Desde el browser',
      description: 'Cámara + micrófono, sin instalar nada',
    },
    {
      id: 'obs',
      icon: <Monitor className="h-5 w-5" />,
      label: 'OBS / Encoder',
      description: 'RTMP con OBS, Wirecast, Teradek, vMix',
    },
    {
      id: 'vod2live',
      icon: <Film className="h-5 w-5" />,
      label: 'VOD2Live',
      description: 'Transmitir un video VOD como stream en vivo',
    },
    {
      id: 'scheduled',
      icon: <CalendarDays className="h-5 w-5" />,
      label: 'Programado (EPG)',
      description: 'Agendar una transmisión en la grilla',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Mode selector cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            className={[
              'rounded-xl border p-4 text-left transition-all hover:border-primary/50',
              mode === opt.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card',
            ].join(' ')}
          >
            <div className={`mb-2 ${mode === opt.id ? 'text-primary' : 'text-muted-foreground'}`}>
              {opt.icon}
            </div>
            <p className="text-sm font-medium leading-tight">{opt.label}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{opt.description}</p>
          </button>
        ))}
      </div>

      {/* Panel for selected mode */}
      <Card>
        <CardContent className="pt-6">
          {mode === 'browser' && <BrowserPanel content={content} />}
          {mode === 'obs' && <ObsPanel content={content} rtmpUrl={rtmpUrl} />}
          {mode === 'vod2live' && <Vod2LivePanel vodContents={vodContents} content={content} />}
          {mode === 'scheduled' && <ScheduledPanel />}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Browser panel ─────────────────────────────────────────────────────────────

function BrowserPanel({ content }: { content: Content }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Transmitir desde el browser</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Habilitá tu cámara y micrófono. La señal se envía directamente a Castify vía WebRTC — sin instalar nada.
        </p>
      </div>
      <BrowserStreamer streamKey={content.streamKey} />
    </div>
  )
}

// ── OBS panel ─────────────────────────────────────────────────────────────────

function ObsPanel({ content, rtmpUrl }: { content: Content; rtmpUrl: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium">Configuración del encoder</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Ingresá la URL RTMP y el Stream Key en tu software de transmisión.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">URL del servidor RTMP</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono text-muted-foreground break-all">
            {rtmpUrl}
          </code>
          <CopyButton value={rtmpUrl} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Stream Key</p>
        <StreamKeyInput value={content.streamKey} />
        <p className="text-xs text-muted-foreground">
          No compartas esta clave — da acceso directo a tu stream.
        </p>
      </div>

      <Separator />

      <div className="grid md:grid-cols-2 gap-3">
        <EncoderGuide
          title="OBS Studio"
          steps={[
            'Ajustes → Emisión → Tipo: Personalizado',
            'Servidor: pegá la URL RTMP',
            'Clave: pegá el Stream Key',
            'Clic en Iniciar transmisión',
          ]}
        />
        <EncoderGuide
          title="Wirecast / vMix / Teradek"
          steps={[
            'Destino → RTMP personalizado',
            'URL del servidor: la URL RTMP',
            'Stream Name / Key: el Stream Key',
            'Iniciar transmisión',
          ]}
        />
      </div>
    </div>
  )
}

function EncoderGuide({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
      <p className="text-xs font-semibold">{title}</p>
      <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  )
}

// ── VOD2Live panel ────────────────────────────────────────────────────────────

function Vod2LivePanel({
  vodContents,
  content,
}: {
  vodContents: Content[]
  content: Content
}) {
  const [selectedVod, setSelectedVod] = useState<string>('')
  const [startTime, setStartTime] = useState('0')
  const [duration, setDuration] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleStart() {
    if (!selectedVod) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await api['fetch']<unknown>(
        `/api/channels/me/content/${selectedVod}/vod2live/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            liveContentId: content.id,
            startTimeSec: Number(startTime),
            durationSec: duration ? Number(duration) : undefined,
          }),
        },
      )
      setStatus('ok')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error desconocido')
      setStatus('error')
    }
  }

  async function handleStop() {
    setStatus('loading')
    try {
      await api['fetch']<unknown>(
        `/api/channels/me/content/${selectedVod}/vod2live/stop`,
        { method: 'POST' },
      )
      setStatus('idle')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al detener')
      setStatus('error')
    }
  }

  if (vodContents.length === 0) {
    return (
      <Alert>
        <Film className="h-4 w-4" />
        <AlertTitle>No hay videos VOD disponibles</AlertTitle>
        <AlertDescription>
          Subí un video VOD desde la sección{' '}
          <a href="/content" className="underline underline-offset-2">Contenido</a>{' '}
          para usarlo como stream en vivo.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium">VOD2Live</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Reproducí un video VOD en bucle como si fuera un stream en vivo.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Video a transmitir</label>
          <Select value={selectedVod} onValueChange={setSelectedVod}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccioná un VOD…" />
            </SelectTrigger>
            <SelectContent>
              {vodContents.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Inicio (segundos){' '}
              <span className="text-muted-foreground font-normal">opcional</span>
            </label>
            <input
              type="number"
              min="0"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Duración (segundos){' '}
              <span className="text-muted-foreground font-normal">opcional</span>
            </label>
            <input
              type="number"
              min="1"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Todo el video"
            />
          </div>
        </div>
      </div>

      {status === 'error' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}
      {status === 'ok' && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>VOD2Live activo</AlertTitle>
          <AlertDescription>El video se está transmitiendo como stream en vivo.</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => void handleStart()}
          disabled={!selectedVod || status === 'loading' || status === 'ok'}
        >
          {status === 'loading' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Iniciar VOD2Live
        </Button>
        {status === 'ok' && (
          <Button variant="outline" onClick={() => void handleStop()}>
            Detener
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Scheduled panel ───────────────────────────────────────────────────────────

function ScheduledPanel() {
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleCreate() {
    if (!title || !startTime || !endTime) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await api['fetch']<unknown>('/api/channels/me/epg', {
        method: 'POST',
        body: JSON.stringify({
          title,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        }),
      })
      setStatus('ok')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al crear entrada')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium">Programar transmisión (EPG)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Creá una entrada en la grilla de programación. Los espectadores podrán ver cuándo empieza tu próxima transmisión.
        </p>
      </div>

      {status === 'ok' ? (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Entrada creada</AlertTitle>
          <AlertDescription>
            La transmisión fue agendada.{' '}
            <a href="/epg" className="underline underline-offset-2">
              Ver grilla EPG <ChevronRight className="inline h-3 w-3" />
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Título del programa</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Clase magistral de diseño"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Inicio</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fin</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {status === 'error' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={() => void handleCreate()}
            disabled={!title || !startTime || !endTime || status === 'loading'}
          >
            {status === 'loading' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Agendar transmisión
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Multistream ────────────────────────────────────────────────────────

type DestValues = Record<string, string>

function MultistreamTab({ content }: { content: Content }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, DestValues>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function togglePlatform(id: string) {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function setField(platformId: string, key: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [platformId]: { ...(prev[platformId] ?? {}), [key]: value },
    }))
  }

  async function handleStart() {
    const destinations: Record<string, unknown> = {}
    for (const p of PLATFORMS) {
      if (!enabled[p.id] || p.soon) continue
      const v = values[p.id] ?? {}
      const built: Record<string, string> = {}
      for (const f of p.fields) built[f.key] = v[f.key] ?? ''
      destinations[p.id] = built
    }

    setStatus('loading')
    setErrorMsg('')
    try {
      await api['fetch']<unknown>(
        `/api/streaming/${content.id}/multistream/start`,
        { method: 'POST', body: JSON.stringify(destinations) },
      )
      setStatus('running')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al iniciar')
      setStatus('error')
    }
  }

  async function handleStop() {
    setStatus('loading')
    try {
      await api['fetch']<unknown>(
        `/api/streaming/${content.id}/multistream/stop`,
        { method: 'POST' },
      )
      setStatus('idle')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al detener')
      setStatus('error')
    }
  }

  const activeCount = PLATFORMS.filter((p) => enabled[p.id] && !p.soon).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Destinos de multistream</CardTitle>
              <CardDescription>
                Activá las plataformas y pegá tus claves RTMP para retransmitir en simultáneo.
              </CardDescription>
            </div>
            {status === 'running' && (
              <Badge variant="success" className="gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                En vivo
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {PLATFORMS.map((p) => (
            <PlatformRow
              key={p.id}
              platform={p}
              enabled={!!enabled[p.id]}
              values={values[p.id] ?? {}}
              onToggle={() => togglePlatform(p.id)}
              onFieldChange={(key, val) => setField(p.id, key, val)}
              disabled={status === 'running' || !!p.soon}
            />
          ))}
        </CardContent>
      </Card>

      {status === 'error' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {status !== 'running' ? (
          <Button
            onClick={() => void handleStart()}
            disabled={activeCount === 0 || status === 'loading'}
          >
            {status === 'loading' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Iniciar multistream
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {activeCount}
              </Badge>
            )}
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => void handleStop()}>
            Detener multistream
          </Button>
        )}
      </div>
    </div>
  )
}

function PlatformRow({
  platform,
  enabled,
  values,
  onToggle,
  onFieldChange,
  disabled,
}: {
  platform: PlatformDef
  enabled: boolean
  values: DestValues
  onToggle: () => void
  onFieldChange: (key: string, value: string) => void
  disabled: boolean
}) {
  return (
    <div className={[
      'rounded-lg border transition-colors',
      enabled ? 'border-border bg-muted/20' : 'border-border/50',
    ].join(' ')}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={platform.color}>{platform.icon}</span>
        <span className="font-medium text-sm flex-1">{platform.label}</span>
        {platform.soon ? (
          <Badge variant="outline" className="text-xs">Próximamente</Badge>
        ) : (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={disabled}
          />
        )}
      </div>

      {/* Fields — only shown when enabled */}
      {enabled && !platform.soon && (
        <>
          <Separator />
          <div className="px-4 py-3 grid gap-2.5">
            {platform.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  disabled={disabled}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 3: Config ─────────────────────────────────────────────────────────────

function ConfigTab() {
  const [bitrate, setBitrate] = useState('2500')
  const [resolution, setResolution] = useState('1080')
  const [chatEnabled, setChatEnabled] = useState(true)
  const [autoRecord, setAutoRecord] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración del stream</CardTitle>
        <CardDescription>
          Ajustes de calidad y funcionalidades adicionales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bitrate */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Bitrate de video</label>
          <Select value={bitrate} onValueChange={setBitrate}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="500">500 kbps — 360p</SelectItem>
              <SelectItem value="1000">1 Mbps — 480p</SelectItem>
              <SelectItem value="2500">2.5 Mbps — 720p</SelectItem>
              <SelectItem value="4000">4 Mbps — 1080p</SelectItem>
              <SelectItem value="6000">6 Mbps — 1080p60</SelectItem>
              <SelectItem value="8000">8 Mbps — 4K</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Recomendado para 1080p: 4 Mbps. Asegurate de tener el doble de subida disponible.
          </p>
        </div>

        {/* Resolution */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Resolución</label>
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="480">480p (854 × 480)</SelectItem>
              <SelectItem value="720">720p (1280 × 720)</SelectItem>
              <SelectItem value="1080">1080p (1920 × 1080)</SelectItem>
              <SelectItem value="2160">4K (3840 × 2160)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Toggles */}
        <div className="space-y-4">
          <ToggleRow
            label="Chat habilitado"
            description="Permite que los espectadores envíen mensajes en tiempo real."
            checked={chatEnabled}
            onChange={setChatEnabled}
          />
          <ToggleRow
            label="Grabación automática"
            description="Guarda el stream como VOD cuando termine la transmisión."
            checked={autoRecord}
            onChange={setAutoRecord}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

// ── Upgrade card ──────────────────────────────────────────────────────────────

function UpgradeCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1 max-w-sm">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" className="mt-1" asChild>
          <a href="/settings">
            Ver planes <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
