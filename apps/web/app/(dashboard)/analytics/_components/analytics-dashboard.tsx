'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { Content } from '@castify/types'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import {
  Users, TrendingUp, Clock, Zap, Download,
  HardDrive, DollarSign, RefreshCw, BarChart2,
} from 'lucide-react'
import { api, type CastifyVideoDashboard } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveAnalytics {
  viewers: number
  p2pOffloadPct: number
  cdnBandwidthGB: number
  p2pBandwidthGB: number
  estimatedSavings: number
  quality: string
  avgLatencyMs: number
  bufferingEventsPerViewer: number
}

interface RetentionPoint {
  minute: number
  viewers: number
}

interface Summary {
  title: string
  durationSec: number | null
  peakViewers: number
  averageViewers: number
  totalP2PBandwidthGB: number
  totalCDNBandwidthGB: number
  avgP2POffloadPct: string
  estimatedSavingsUSD: string
  snapshotCount: number
}

interface VideoBillingRecord {
  id: string
  month: number
  year: number
  cdn1to1Gb: number
  hybridGb: number
  cdn1to1Cost: number
  hybridCost: number
  baseFee: number
  totalCost: number
  sessionCount: number
  paid: boolean
}

type Period = '60' | '360' | '1440' | 'all'

const PERIOD_LABELS: Record<Period, string> = {
  '60': 'Última hora',
  '360': 'Últimas 6 h',
  '1440': 'Últimas 24 h',
  'all': 'Todo',
}

const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Main component ────────────────────────────────────────────────────────────

export function AnalyticsDashboard({ contents }: { contents: Content[] }) {
  const [contentId, setContentId] = useState<string>(contents[0]?.id ?? '')
  const [period, setPeriod] = useState<Period>('all')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [live, setLive] = useState<LiveAnalytics | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [retention, setRetention] = useState<RetentionPoint[]>([])
  const [videoCurrent, setVideoCurrent] = useState<CastifyVideoDashboard | null>(null)
  const [videoBilling, setVideoBilling] = useState<VideoBillingRecord[]>([])

  const load = useCallback(async (isRefresh = false) => {
    if (!contentId) return
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [liveData, summaryData, retentionData] = await Promise.all([
        api['fetch']<LiveAnalytics>(`/api/channels/me/content/${contentId}/analytics/live`),
        api['fetch']<Summary>(`/api/channels/me/content/${contentId}/analytics/summary`),
        api['fetch']<RetentionPoint[]>(`/api/channels/me/content/${contentId}/analytics/retention`),
      ])
      setLive(liveData)
      setSummary(summaryData)
      setRetention(retentionData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [contentId])

  useEffect(() => {
    void load()
    // Also load video billing once
    void api.castifyVideo.getCurrentUsage().then((d) => {
      const usage = d as { castifyVideo?: CastifyVideoDashboard }
      setVideoCurrent(usage.castifyVideo ?? null)
    }).catch(() => null)
    void api.castifyVideo.getBillingHistory().then((d) => {
      setVideoBilling(d as VideoBillingRecord[])
    }).catch(() => null)
  }, [load])

  // Period filter on retention data
  const filteredRetention = period === 'all'
    ? retention
    : retention.filter((p) => {
        const maxMinutes = Number(period)
        const minMinute = Math.max(0, (retention.at(-1)?.minute ?? 0) - maxMinutes)
        return p.minute >= minMinute
      })

  // Normalize retention to %
  const peakRetention = Math.max(...filteredRetention.map((p) => p.viewers), 1)
  const retentionPct = filteredRetention.map((p) => ({
    minute: p.minute,
    viewers: p.viewers,
    pct: +((p.viewers / peakRetention) * 100).toFixed(1),
  }))

  // P2P vs CDN donut data
  const p2pGb = summary?.totalP2PBandwidthGB ?? 0
  const cdnGb = summary?.totalCDNBandwidthGB ?? 0
  const totalGb = p2pGb + cdnGb
  const donutData = [
    { name: 'P2P', value: +p2pGb.toFixed(3), color: '#6366f1' },
    { name: 'CDN', value: +cdnGb.toFixed(3), color: '#e2e8f0' },
  ]

  if (contents.length === 0) {
    return (
      <Alert>
        <BarChart2 className="h-4 w-4" />
        <AlertDescription>
          No hay contenido disponible. Creá un stream LIVE o subí un VOD para ver analytics.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={contentId} onValueChange={setContentId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Seleccioná contenido" />
          </SelectTrigger>
          <SelectContent>
            {contents.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <Badge variant={c.type === 'LIVE' ? 'destructive' : 'secondary'} className="text-[10px] px-1 py-0">
                    {c.type}
                  </Badge>
                  {c.title}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv(filteredRetention, summary)}
          disabled={!summary}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Stats cards ───────────────────────────────────────────────────── */}
      {loading ? (
        <StatsCardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Peak concurrent"
            value={summary?.peakViewers ?? live?.viewers ?? 0}
            sub={live ? `${live.viewers} ahora` : undefined}
            highlight={!!live?.viewers}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Promedio viewers"
            value={summary?.averageViewers ?? 0}
            sub={`${summary?.avgP2POffloadPct ?? '0'}% P2P`}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Latencia prom."
            value={live?.avgLatencyMs ?? 0}
            suffix=" ms"
            sub={`Calidad: ${live?.quality ?? '—'}`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="Ahorro estimado"
            value={`$${summary?.estimatedSavingsUSD ?? '0.00'}`}
            sub={`${totalGb.toFixed(2)} GB total`}
          />
        </div>
      )}

      {/* ── Charts row 1: Viewers timeline + P2P donut ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Viewers timeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Viewers en el tiempo</CardTitle>
            <CardDescription>
              Espectadores únicos por minuto desde el inicio del stream
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : filteredRetention.length === 0 ? (
              <EmptyChart />
            ) : (
              <ChartContainer height={220}>
                <AreaChart data={retentionPct}>
                  <defs>
                    <linearGradient id="viewersGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="minute"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v: number) => `${v}m`}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    width={32}
                  />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(l) => `Minuto ${l}`}
                        valueFormatter={(v, n) => n === 'viewers' ? `${v} viewers` : `${v}%`}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="viewers"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#viewersGrad)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* P2P vs CDN donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">P2P vs CDN</CardTitle>
            <CardDescription>Distribución de bandwidth total</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : totalGb === 0 ? (
              <EmptyChart label="Sin datos de bandwidth" />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ChartContainer height={160}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltipContent
                          valueFormatter={(v) => `${v} GB`}
                        />
                      }
                    />
                  </PieChart>
                </ChartContainer>
                <div className="w-full space-y-2">
                  <BandwidthRow color="#6366f1" label="P2P" gb={p2pGb} total={totalGb} />
                  <BandwidthRow color="#e2e8f0" label="CDN" gb={cdnGb} total={totalGb} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Chart 2: Retention curve ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Curva de retención</CardTitle>
          <CardDescription>
            % de espectadores que siguen viendo en cada minuto (100% = peak)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : retentionPct.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer height={190}>
              <LineChart data={retentionPct}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="minute"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => `${v}m`}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  width={36}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(l) => `Minuto ${l}`}
                      valueFormatter={(v, n) => n === 'pct' ? `${v}%` : `${v} viewers`}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="pct"
                  name="Retención"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Top sessions table ────────────────────────────────────────────── */}
      {summary && summary.snapshotCount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Resumen de sesión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Métrica</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <TableRow label="Peak viewers" value={String(summary.peakViewers)} />
                  <TableRow label="Promedio viewers" value={String(summary.averageViewers)} />
                  <TableRow label="P2P offload" value={`${summary.avgP2POffloadPct}%`} />
                  <TableRow label="Bandwidth P2P" value={`${summary.totalP2PBandwidthGB.toFixed(3)} GB`} />
                  <TableRow label="Bandwidth CDN" value={`${summary.totalCDNBandwidthGB.toFixed(3)} GB`} />
                  <TableRow label="Ahorro estimado" value={`$${summary.estimatedSavingsUSD}`} />
                  {summary.durationSec != null && (
                    <TableRow label="Duración" value={formatDuration(summary.durationSec)} />
                  )}
                  <TableRow label="Snapshots recibidos" value={String(summary.snapshotCount)} />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Castify Video section ─────────────────────────────────────────── */}
      {(videoCurrent || videoBilling.length > 0) && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Castify Video</h2>
            <p className="text-sm text-muted-foreground">Uso y facturación de sesiones de video privado</p>
          </div>

          {/* Video stats */}
          {videoCurrent && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<HardDrive className="h-4 w-4" />}
                label="Bandwidth total"
                value={`${(videoCurrent.monthlyGbUsed).toFixed(2)} GB`}
                sub={`de ${videoCurrent.bandwidthCapGb} GB`}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Sesiones activas"
                value={videoCurrent.activeSessions}
                sub="en este momento"
              />
              <StatCard
                icon={<DollarSign className="h-4 w-4" />}
                label="Costo estimado"
                value={`$${videoCurrent.totalEstimate.toFixed(2)}`}
                sub="este mes"
              />
              <StatCard
                icon={<Zap className="h-4 w-4" />}
                label="Uso del cap"
                value={`${(videoCurrent.capPct * 100).toFixed(1)}%`}
                sub={videoCurrent.nearCap ? '⚠ Cerca del límite' : 'Dentro del límite'}
                highlight={videoCurrent.nearCap}
              />
            </div>
          )}

          {/* Billing chart: monthly bandwidth */}
          {videoBilling.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Bandwidth mensual (GB)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer height={200}>
                    <AreaChart data={videoBilling.slice().reverse().map((b) => ({
                      period: `${MONTH_NAMES[b.month]} ${b.year}`,
                      cdn: +b.cdn1to1Gb.toFixed(2),
                      p2p: +b.hybridGb.toFixed(2),
                    }))}>
                      <defs>
                        <linearGradient id="cdnGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="p2pGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={36} />
                      <Tooltip
                        content={
                          <ChartTooltipContent
                            valueFormatter={(v) => `${v} GB`}
                          />
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="cdn" name="CDN 1-a-1" stroke="#6366f1" strokeWidth={2} fill="url(#cdnGrad)" dot={false} />
                      <Area type="monotone" dataKey="p2p" name="Híbrido" stroke="#22c55e" strokeWidth={2} fill="url(#p2pGrad)" dot={false} />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* 1-to-1 vs group ratio donut */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Tipo de sesión</CardTitle>
                  <CardDescription>Ratio 1-a-1 vs grupal acumulado</CardDescription>
                </CardHeader>
                <CardContent>
                  <VideoRatioDonut billing={videoBilling} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Billing history table */}
          {videoBilling.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Historial de facturación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {['Período', 'Sesiones', '1-a-1 GB', 'Híbrido GB', 'Total', 'Estado'].map((h) => (
                          <th key={h} className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground first:text-left last:text-right">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {videoBilling.map((b) => (
                        <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5 font-medium">{MONTH_NAMES[b.month]} {b.year}</td>
                          <td className="px-3 py-2.5">{b.sessionCount}</td>
                          <td className="px-3 py-2.5">{b.cdn1to1Gb.toFixed(2)} GB</td>
                          <td className="px-3 py-2.5">{b.hybridGb.toFixed(2)} GB</td>
                          <td className="px-3 py-2.5 font-mono font-semibold">${b.totalCost.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <Badge variant={b.paid ? 'success' : 'warning'}>
                              {b.paid ? 'Pagado' : 'Pendiente'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, suffix = '', sub, highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  suffix?: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon} {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : ''}`}>
          {value}{suffix}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function BandwidthRow({ color, label, gb, total }: { color: string; label: string; gb: number; total: number }) {
  const pct = total > 0 ? (gb / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground w-8">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono w-16 text-right">{gb.toFixed(2)} GB</span>
      <span className="text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-muted-foreground">{label}</td>
      <td className="px-4 py-2.5 text-right font-medium">{value}</td>
    </tr>
  )
}

function EmptyChart({ label = 'Sin datos para este período' }: { label?: string }) {
  return (
    <div className="h-40 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
          <CardContent><Skeleton className="h-8 w-20 mb-1" /><Skeleton className="h-3 w-28" /></CardContent>
        </Card>
      ))}
    </div>
  )
}

function VideoRatioDonut({ billing }: { billing: VideoBillingRecord[] }) {
  const cdn1to1Total = billing.reduce((a, b) => a + b.cdn1to1Gb, 0)
  const hybridTotal = billing.reduce((a, b) => a + b.hybridGb, 0)
  const total = cdn1to1Total + hybridTotal
  if (total === 0) return <EmptyChart label="Sin datos" />

  const data = [
    { name: '1-a-1', value: +cdn1to1Total.toFixed(2), color: '#6366f1' },
    { name: 'Grupal', value: +hybridTotal.toFixed(2), color: '#22c55e' },
  ]

  return (
    <div className="flex flex-col items-center gap-3">
      <ChartContainer height={140}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={2} dataKey="value">
            {data.map((d, i) => <Cell key={i} fill={d.color} strokeWidth={0} />)}
          </Pie>
          <Tooltip content={<ChartTooltipContent valueFormatter={(v) => `${v} GB`} />} />
        </PieChart>
      </ChartContainer>
      <div className="w-full space-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="flex-1 text-right font-medium">{d.value} GB</span>
            <span className="text-muted-foreground">({((d.value / total) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function exportCsv(retention: RetentionPoint[], summary: Summary | null) {
  const rows: string[][] = [
    ['Minuto', 'Viewers'],
    ...retention.map((r) => [String(r.minute), String(r.viewers)]),
  ]
  if (summary) {
    rows.push([])
    rows.push(['Métrica', 'Valor'])
    rows.push(['Peak viewers', String(summary.peakViewers)])
    rows.push(['Promedio viewers', String(summary.averageViewers)])
    rows.push(['P2P offload %', summary.avgP2POffloadPct])
    rows.push(['P2P GB', String(summary.totalP2PBandwidthGB)])
    rows.push(['CDN GB', String(summary.totalCDNBandwidthGB)])
    rows.push(['Ahorro USD', summary.estimatedSavingsUSD])
  }

  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
