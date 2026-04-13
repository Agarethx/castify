'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type {
  CastifyVideoCurrentUsage,
  CastifyVideoBillingRecord,
  VideoSession,
} from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  HardDrive,
  MoreVertical,
  Plus,
  RefreshCw,
  Square,
  Users,
  Wifi,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

function fmtGb(n: number) { return `${n.toFixed(2)} GB` }
function fmtUsd(n: number) { return `$${n.toFixed(2)}` }

function elapsed(startedAt: string | null): string {
  if (!startedAt) return '—'
  const ms = Date.now() - new Date(startedAt).getTime()
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function duration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return '—'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CastifyVideoPage(): React.JSX.Element {
  const [usage, setUsage] = useState<CastifyVideoCurrentUsage | null>(null)
  const [active, setActive] = useState<VideoSession[]>([])
  const [ended, setEnded] = useState<VideoSession[]>([])
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [loadingActive, setLoadingActive] = useState(true)
  const [loadingEnded, setLoadingEnded] = useState(true)
  const [stopping, setStopping] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true)
    try {
      setUsage(await api.castifyVideo.getCurrentUsage())
    } finally {
      setLoadingUsage(false)
    }
  }, [])

  const loadActive = useCallback(async () => {
    setLoadingActive(true)
    try {
      setActive(await api.castifyVideo.listSessions('active'))
    } finally {
      setLoadingActive(false)
    }
  }, [])

  const loadEnded = useCallback(async () => {
    setLoadingEnded(true)
    try {
      setEnded(await api.castifyVideo.listSessions('ended'))
    } finally {
      setLoadingEnded(false)
    }
  }, [])

  useEffect(() => {
    void loadUsage()
    void loadActive()
    void loadEnded()
  }, [loadUsage, loadActive, loadEnded])

  async function handleStop(sessionId: string) {
    setStopping(sessionId)
    try {
      await api.castifyVideo.endSession(sessionId)
      await Promise.all([loadUsage(), loadActive(), loadEnded()])
    } finally {
      setStopping(null)
    }
  }

  async function copyStreamKey(session: VideoSession) {
    await navigator.clipboard.writeText(session.streamKey)
    setCopiedId(session.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const capPct = usage ? Math.min(usage.capPct * 100, 100) : 0

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Castify Video</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sesiones privadas 1-a-1 (CDN) y grupales (P2P híbrido) con facturación transparente
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => { void loadUsage(); void loadActive(); void loadEnded() }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Usage panel */}
      <UsagePanel
        usage={usage}
        loading={loadingUsage}
        capPct={capPct}
      />

      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="active" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Activas
            {active.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 h-4 text-[10px]">
                {active.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ended" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Cerradas
          </TabsTrigger>
          <TabsTrigger value="new" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <ActiveSessionsTab
            sessions={active}
            loading={loadingActive}
            stopping={stopping}
            copiedId={copiedId}
            onStop={(id) => void handleStop(id)}
            onCopy={(s) => void copyStreamKey(s)}
          />
        </TabsContent>

        <TabsContent value="ended" className="mt-4">
          <EndedSessionsTab sessions={ended} loading={loadingEnded} />
        </TabsContent>

        <TabsContent value="new" className="mt-4">
          <NewSessionTab
            onCreated={() => { void loadUsage(); void loadActive() }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Usage panel ───────────────────────────────────────────────────────────────

function UsagePanel({
  usage,
  loading,
  capPct,
}: {
  usage: CastifyVideoCurrentUsage | null
  loading: boolean
  capPct: number
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Uso del mes actual</CardTitle>
          {usage && (
            <span className="text-xs text-muted-foreground">
              {MONTH_NAMES[usage.month]} {usage.year}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        ) : usage ? (
          <>
            {usage.nearCap && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Alerta: consumiste el <strong>{Math.round(usage.capPct * 100)}%</strong> del límite
                  mensual ({usage.capGb} GB). Considerá reducir el uso o contactar a soporte.
                </AlertDescription>
              </Alert>
            )}

            {/* Bandwidth progress */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{fmtGb(usage.totalGb)} usados</span>
                <span>{fmtGb(usage.capGb)} límite</span>
              </div>
              <Progress
                value={capPct}
                indicatorClassName={usage.nearCap ? 'bg-red-500' : undefined}
              />
              <p className="text-xs text-muted-foreground text-right">
                {capPct.toFixed(1)}% del límite mensual
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Sesiones (mes)"
                value={String(usage.sessionCount)}
              />
              <StatCard
                icon={<Activity className="h-4 w-4" />}
                label="Activas ahora"
                value={`${usage.concurrentActive} / ${usage.maxConcurrent}`}
                valueClass={usage.concurrentActive > 0 ? 'text-green-400' : undefined}
              />
              <StatCard
                icon={<Globe className="h-4 w-4" />}
                label="CDN 1-a-1"
                value={fmtGb(usage.cdn1to1Gb)}
                sub={fmtUsd(usage.cdn1to1Cost)}
              />
              <StatCard
                icon={<Wifi className="h-4 w-4" />}
                label="Híbrido P2P"
                value={fmtGb(usage.hybridGb)}
                sub={fmtUsd(usage.hybridCost)}
              />
            </div>

            {/* Breakdown table */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Concepto</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">GB</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tarifa</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-3 py-2">CDN 1-a-1</td>
                    <td className="px-3 py-2 text-right">{usage.cdn1to1Gb.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">$0.04635/GB</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUsd(usage.cdn1to1Cost)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Híbrido P2P grupal</td>
                    <td className="px-3 py-2 text-right">{usage.hybridGb.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">$0.015/GB</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUsd(usage.hybridCost)}</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground" colSpan={3}>Tarifa base mensual</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUsd(usage.baseFee)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-3 py-2" colSpan={3}>Total estimado</td>
                    <td className="px-3 py-2 text-right font-mono text-primary">
                      {fmtUsd(usage.estimatedTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Active sessions tab ───────────────────────────────────────────────────────

function ActiveSessionsTab({
  sessions,
  loading,
  stopping,
  copiedId,
  onStop,
  onCopy,
}: {
  sessions: VideoSession[]
  loading: boolean
  stopping: string | null
  copiedId: string | null
  onStop: (id: string) => void
  onCopy: (s: VideoSession) => void
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Activity className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">Sin sesiones activas</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Las sesiones iniciadas aparecerán aquí en tiempo real.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sesión</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tiempo</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bandwidth</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo est.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[200px]" title={s.title}>{s.title}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-3">
                    <SessionModeBadge mode={s.mode} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="text-green-400">{elapsed(s.startedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="flex items-center justify-end gap-1">
                      <HardDrive className="h-3 w-3 text-muted-foreground" />
                      {fmtGb(s.bandwidthGb)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtUsd(s.bandwidthGb * s.ratePerGb)}
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Acciones</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onCopy(s)}>
                          {copiedId === s.id ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          {copiedId === s.id ? 'Copiado' : 'Copiar stream key'}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/castify-video/sessions/${s.id}/analytics`} target="_blank" rel="noopener noreferrer">
                            <BarChart3 className="h-4 w-4" />
                            Ver analytics
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={stopping === s.id}
                          onClick={() => onStop(s.id)}
                        >
                          <Square className="h-4 w-4" />
                          {stopping === s.id ? 'Deteniendo…' : 'Detener sesión'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Ended sessions tab ────────────────────────────────────────────────────────

function EndedSessionsTab({
  sessions,
  loading,
}: {
  sessions: VideoSession[]
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | '1to1' | 'group'>('all')

  const filtered = sessions.filter((s) => {
    if (filterMode !== 'all' && s.mode !== filterMode) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Input
            placeholder="Buscar sesión…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(['all', '1to1', 'group'] as const).map((m) => (
            <Button
              key={m}
              variant={filterMode === m ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setFilterMode(m)}
            >
              {m === 'all' ? 'Todos' : m === '1to1' ? '1-a-1' : 'Grupal'}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        {sessions.length === 0 ? (
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Sin sesiones cerradas</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Las sesiones finalizadas aparecerán aquí.
              </p>
            </div>
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sesión</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Duración</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Bandwidth</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Costo</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                        Sin resultados para los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium truncate max-w-[200px]" title={s.title}>{s.title}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.id.slice(0, 8)}…</p>
                        </td>
                        <td className="px-4 py-3">
                          <SessionModeBadge mode={s.mode} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {duration(s.startedAt, s.endedAt)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtGb(s.bandwidthGb)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {s.totalCost != null ? fmtUsd(s.totalCost) : fmtUsd(s.bandwidthGb * s.ratePerGb)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmtDate(s.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? 'sesión' : 'sesiones'}
                  {(search || filterMode !== 'all') && ' (filtrado)'}
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// ── New session tab ───────────────────────────────────────────────────────────

interface NewSessionForm {
  title: string
  mode: '1to1' | 'group'
  password: string
  webhookUrl: string
}

function NewSessionTab({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<NewSessionForm>({
    title: '',
    mode: '1to1',
    password: '',
    webhookUrl: '',
  })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    id: string
    streamKey: string
    password?: string
    deliveryMode: string
    expectedRate: number
  } | null>(null)

  async function handleCreate() {
    if (!form.title.trim()) return
    setCreating(true)
    setError(null)
    try {
      const data = await api.castifyVideo.createSession({
        title: form.title.trim(),
        mode: form.mode,
        password: form.password || undefined,
        webhookUrl: form.webhookUrl || undefined,
      })
      setResult(data)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear sesión')
    } finally {
      setCreating(false)
    }
  }

  function reset() {
    setResult(null)
    setForm({ title: '', mode: '1to1', password: '', webhookUrl: '' })
    setError(null)
  }

  if (result) {
    return (
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="h-4 w-4 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Sesión creada exitosamente</p>
              <p className="text-xs text-muted-foreground">Compartí el stream key con el presentador</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4 space-y-2.5 text-sm">
            <ResultRow label="ID" value={result.id} mono copyable />
            <ResultRow label="Stream Key" value={result.streamKey} mono copyable />
            {result.password && <ResultRow label="Password" value={result.password} mono copyable />}
            <ResultRow label="Modo entrega" value={result.deliveryMode} />
            <ResultRow label="Tarifa" value={`${fmtUsd(result.expectedRate)}/GB`} />
          </div>

          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Crear otra sesión
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Título</label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Webinar exclusivo, clase magistral…"
          />
        </div>

        {/* Mode selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Modo</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeCard
              selected={form.mode === '1to1'}
              onClick={() => setForm((f) => ({ ...f, mode: '1to1' }))}
              icon={<ExternalLink className="h-5 w-5" />}
              title="1-a-1 CDN"
              description="Sesión privada, entrega CDN pura. Protegida por contraseña."
              rate="$0.04635/GB"
            />
            <ModeCard
              selected={form.mode === 'group'}
              onClick={() => setForm((f) => ({ ...f, mode: 'group' }))}
              icon={<Users className="h-5 w-5" />}
              title="Grupal P2P híbrido"
              description="Múltiples espectadores. P2P reduce costos significativamente."
              rate="$0.015/GB"
            />
          </div>
        </div>

        {/* Password (only for 1to1) */}
        {form.mode === '1to1' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Password personalizado{' '}
              <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </label>
            <Input
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Se genera automáticamente si se deja vacío"
            />
          </div>
        )}

        {/* Webhook */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Webhook URL{' '}
            <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
          </label>
          <Input
            type="url"
            value={form.webhookUrl}
            onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
            placeholder="https://tu-servidor.com/webhook"
          />
        </div>

        <Button
          onClick={() => void handleCreate()}
          disabled={creating || !form.title.trim()}
          className="gap-2"
        >
          {creating ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Crear sesión
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={cn('text-lg font-semibold', valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function SessionModeBadge({ mode }: { mode: '1to1' | 'group' }) {
  if (mode === '1to1') {
    return (
      <Badge variant="outline" className="gap-1 border-blue-500/40 text-blue-400 bg-blue-500/10">
        <ExternalLink className="h-3 w-3" />
        1-a-1 CDN
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-purple-500/40 text-purple-400 bg-purple-500/10">
      <Users className="h-3 w-3" />
      Grupal P2P
    </Badge>
  )
}

function ModeCard({
  selected,
  onClick,
  icon,
  title,
  description,
  rate,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
  rate: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 text-left transition-all space-y-2',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border bg-background hover:border-muted-foreground/40',
      )}
    >
      <div className={cn('', selected ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Badge variant="secondary" className="text-xs font-mono">
        {rate}
      </Badge>
    </button>
  )
}

function ResultRow({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-28 shrink-0 text-xs mt-0.5">{label}:</span>
      <span className={cn('flex-1 break-all', mono && 'font-mono text-xs')}>{value}</span>
      {copyable && (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          title="Copiar"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
