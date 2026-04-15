'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Radio,
  Video,
  Film,
  Users,
  TrendingUp,
  Zap,
  Share2,
  Lock,
  HardDrive,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  DollarSign,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { api, type DashboardSummary, type DashboardStats, type CastifyVideoDashboard } from '@/lib/api'

// ── Tier config ───────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
}

const PLAN_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'warning' | 'success'> = {
  STARTER: 'secondary',
  PRO: 'default',
  ENTERPRISE: 'success',
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardHome({ channelName, channelSlug }: { channelName: string; channelSlug: string }) {
  // Set tenant synchronously before first render so all API calls have the header
  if (channelSlug) api.setTenant(channelSlug)

  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!channelSlug) { setLoading(false); return }
    void load()
  }, [])

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const summary = await api.dashboard.getSummary()
      setData(summary)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando datos')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (loading) return <DashboardSkeleton />

  if (!channelSlug) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Canal sin configurar</AlertTitle>
          <AlertDescription>
            Tu canal no tiene un slug asignado. Andá a{' '}
            <a href="/settings" className="underline font-medium">Configuración → Perfil</a>{' '}
            y completá el campo Slug (URL) para poder usar el dashboard.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Bienvenido, {channelName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumen de actividad del mes actual
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <Badge variant={PLAN_BADGE_VARIANT[data.plan] ?? 'secondary'}>
              {PLAN_LABELS[data.plan] ?? data.plan}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* Castify Video alert */}
          {data.castifyVideo?.nearCap && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Alerta de uso — Castify Video</AlertTitle>
              <AlertDescription>
                Has consumido el{' '}
                <strong>{(data.castifyVideo.capPct * 100).toFixed(0)}%</strong> de tu límite
                mensual de {data.castifyVideo.bandwidthCapGb} GB.{' '}
                <Link href="/castify-video" className="underline underline-offset-2">
                  Ver detalles
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {/* Stat grid — varies by plan */}
          <StatGrid plan={data.plan} stats={data.stats} video={data.castifyVideo} />

          <Separator />

          {/* Quick actions */}
          <QuickActions plan={data.plan} hasVideo={!!data.castifyVideo} />
        </>
      )}
    </div>
  )
}

// ── Stat grid ────────────────────────────────────────────────────────────────

function StatGrid({
  plan,
  stats,
  video,
}: {
  plan: string
  stats: DashboardStats
  video: CastifyVideoDashboard | null
}) {
  const bandwidthPct = Math.min(stats.bandwidthCapPct * 100, 100)

  return (
    <div className="space-y-4">
      {/* ── Row 1: always-visible viewer + stream counts ─────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Viewers ahora"
          value={stats.currentViewers}
          suffix=""
          description="Espectadores activos (≤30 s)"
        />
        <StatCard
          icon={<Radio className="h-4 w-4" />}
          label="Streams activos"
          value={stats.liveStreams}
          description={`${stats.totalContents} contenidos en total`}
        />
        <StatCard
          icon={<Film className="h-4 w-4" />}
          label="Contenidos VOD"
          value={stats.vodContents}
          description="Videos subidos"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="P2P Offload"
          value={stats.p2pOffloadPct}
          suffix="%"
          description={`Ahorro estimado $${stats.estimatedSavingsUsd}`}
          highlight={stats.p2pOffloadPct > 50}
        />
      </div>

      {/* ── Row 2: bandwidth + plan-specific ─────────────────────────────── */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Bandwidth card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                Bandwidth CDN este mes
              </CardTitle>
              <Badge variant={bandwidthPct >= 80 ? 'warning' : 'outline'}>
                {bandwidthPct.toFixed(0)}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold">
                {stats.bandwidthGbUsed.toFixed(1)}
              </span>
              <span className="text-muted-foreground text-sm mb-0.5">
                / {stats.bandwidthCapGb} GB
              </span>
            </div>
            <Progress
              value={bandwidthPct}
              indicatorClassName={bandwidthPct >= 80 ? 'bg-yellow-500' : undefined}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>CDN: {stats.cdnGbUsed.toFixed(1)} GB</span>
              <span>P2P: {stats.p2pGbUsed.toFixed(1)} GB</span>
            </div>
          </CardContent>
        </Card>

        {/* Plan-specific second card */}
        {plan === 'STARTER' && <StarterRevenueCard />}
        {plan === 'PRO' && (
          <ProSessionsCard activeSessions={stats.activePrivateSessions} />
        )}
        {plan === 'ENTERPRISE' && (
          <EnterpriseCard
            multistreamActive={stats.multistreamActive}
            p2pOffloadPct={stats.avgP2pOffloadPct}
          />
        )}
      </div>

      {/* ── Castify Video panel (if active) ──────────────────────────────── */}
      {video && <CastifyVideoPanel video={video} />}
    </div>
  )
}

// ── Plan-specific cards ───────────────────────────────────────────────────────

function StarterRevenueCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          Revenue por ads
        </CardTitle>
        <CardDescription>75% de participación (Starter)</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-muted-foreground">—</p>
        <p className="text-xs text-muted-foreground mt-1">
          Integra tus redes publicitarias para ver datos aquí
        </p>
      </CardContent>
    </Card>
  )
}

function ProSessionsCard({ activeSessions }: { activeSessions: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          Sesiones privadas activas
        </CardTitle>
        <CardDescription>Plan Pro — hasta 100 concurrentes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-bold">{activeSessions}</p>
        <Progress value={(activeSessions / 100) * 100} />
        <p className="text-xs text-muted-foreground">
          {activeSessions} de 100 sesiones concurrentes
        </p>
      </CardContent>
    </Card>
  )
}

function EnterpriseCard({
  multistreamActive,
  p2pOffloadPct,
}: {
  multistreamActive: number
  p2pOffloadPct: number
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Share2 className="h-4 w-4 text-muted-foreground" />
          Multistream & P2P
        </CardTitle>
        <CardDescription>Enterprise — destinos activos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-2xl font-bold">{multistreamActive}</p>
            <p className="text-xs text-muted-foreground">destinos activos</p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div>
            <p className="text-2xl font-bold">{p2pOffloadPct.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">P2P offload</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CastifyVideoPanel({ video }: { video: CastifyVideoDashboard }) {
  const pct = Math.min(video.capPct * 100, 100)
  return (
    <Card className="border-indigo-500/30 bg-indigo-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Video className="h-4 w-4 text-indigo-400" />
            Castify Video — uso del mes
          </CardTitle>
          <Link href="/castify-video">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              Ver detalle <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <MiniStat label="Sesiones activas" value={String(video.activeSessions)} />
          <MiniStat
            label="Bandwidth"
            value={`${video.monthlyGbUsed.toFixed(1)} GB`}
            sub={`de ${video.bandwidthCapGb} GB`}
          />
          <MiniStat
            label="Costo CDN"
            value={`$${video.estimatedCostUsd.toFixed(2)}`}
            sub="+ $50 base"
          />
          <MiniStat
            label="Total estimado"
            value={`$${video.totalEstimate.toFixed(2)}`}
            highlight={video.nearCap}
          />
        </div>
        <Progress
          value={pct}
          indicatorClassName={video.nearCap ? 'bg-red-500' : 'bg-indigo-500'}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
          <span>{pct.toFixed(0)}% del límite mensual</span>
          <span>{video.bandwidthCapGb} GB máx.</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({ plan, hasVideo }: { plan: string; hasVideo: boolean }) {
  const actions: { href: string; icon: React.ReactNode; label: string; show: boolean }[] = [
    {
      href: '/stream',
      icon: <Radio className="h-4 w-4" />,
      label: 'Iniciar stream',
      show: true,
    },
    {
      href: '/content',
      icon: <Film className="h-4 w-4" />,
      label: 'Subir VOD',
      show: true,
    },
    {
      href: '/sessions',
      icon: <Lock className="h-4 w-4" />,
      label: 'Sesión privada',
      show: plan === 'PRO' || plan === 'ENTERPRISE',
    },
    {
      href: '/epg',
      icon: <Zap className="h-4 w-4" />,
      label: 'Programar EPG',
      show: plan === 'PRO' || plan === 'ENTERPRISE',
    },
    {
      href: '/stream',
      icon: <Share2 className="h-4 w-4" />,
      label: 'Multistream',
      show: plan === 'ENTERPRISE',
    },
    {
      href: '/castify-video',
      icon: <Video className="h-4 w-4" />,
      label: 'Nueva sesión video',
      show: hasVideo,
    },
  ]

  const visible = actions.filter(a => a.show)

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Acciones rápidas
      </h2>
      <div className="flex flex-wrap gap-2">
        {visible.map(a => (
          <Button key={a.href + a.label} variant="outline" size="sm" asChild>
            <Link href={a.href} className="flex items-center gap-1.5">
              {a.icon}
              {a.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  suffix = '',
  description,
  highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: number
  suffix?: string
  description?: string
  highlight?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : ''}`}>
          {typeof value === 'number' && !Number.isInteger(value)
            ? value.toFixed(1)
            : value}
          {suffix}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${highlight ? 'text-red-400' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
