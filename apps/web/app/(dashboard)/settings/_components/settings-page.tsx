'use client'

import { useEffect, useRef, useState } from 'react'
import type { UserWithChannel } from '@castify/types'
import type { CastifyVideoBillingRecord } from '@/lib/api'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Bell,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  Key,
  Link2,
  LogOut,
  Plus,
  Receipt,
  RefreshCw,
  Shield,
  Trash2,
  TriangleAlert,
  User,
  Zap,
  Download,
  PlayCircle,
  Globe,
  Music2,
  Gamepad2,
  Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Plan config ───────────────────────────────────────────────────────────────

const PLAN_CONFIG = {
  STARTER: {
    label: 'Starter',
    price: '$0',
    color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    features: ['100 GB/mes', '3 streams simultáneos', 'HLS + RTMP', 'Analytics básico'],
    upgrade: 'PRO',
  },
  PRO: {
    label: 'Pro',
    price: '$99/mes',
    color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    features: ['500 GB/mes', '10 streams simultáneos', 'Multistreaming', 'Castify Video', 'Analytics avanzado'],
    upgrade: 'ENTERPRISE',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    price: '$299/mes',
    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    features: ['10 TB/mes', 'Streams ilimitados', 'SLA 99.9%', 'Soporte dedicado', 'Castify Video ilimitado'],
    upgrade: null,
  },
} as const

const PLAN_LIMITS = {
  STARTER: { bandwidth: '100 GB', streams: 3, castifyVideo: false, multistream: false },
  PRO: { bandwidth: '500 GB', streams: 10, castifyVideo: true, multistream: true },
  ENTERPRISE: { bandwidth: '10 TB', streams: Infinity, castifyVideo: true, multistream: true },
}

// ── Nav items ─────────────────────────────────────────────────────────────────

type SectionId =
  | 'plan'
  | 'profile'
  | 'apikeys'
  | 'webhooks'
  | 'alerts'
  | 'oauth'
  | 'billing'
  | 'security'
  | 'danger'

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ReactNode; danger?: boolean }[] = [
  { id: 'plan', label: 'Plan actual', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'profile', label: 'Perfil', icon: <User className="h-4 w-4" /> },
  { id: 'apikeys', label: 'API Keys', icon: <Key className="h-4 w-4" /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Zap className="h-4 w-4" /> },
  { id: 'alerts', label: 'Alertas', icon: <Bell className="h-4 w-4" /> },
  { id: 'oauth', label: 'Integraciones', icon: <Link2 className="h-4 w-4" /> },
  { id: 'billing', label: 'Facturación', icon: <Receipt className="h-4 w-4" /> },
  { id: 'security', label: 'Seguridad', icon: <Shield className="h-4 w-4" /> },
  { id: 'danger', label: 'Zona peligrosa', icon: <TriangleAlert className="h-4 w-4" />, danger: true },
]

// ── SettingsPage ──────────────────────────────────────────────────────────────

export function SettingsPage({ user }: { user: UserWithChannel }) {
  const slugMissing = !user.channel?.slug
  const [active, setActive] = useState<SectionId>(slugMissing ? 'profile' : 'plan')

  const channel = user.channel
  const plan = channel?.plan ?? 'STARTER'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestioná tu cuenta, integraciones y preferencias
        </p>
      </div>

      {slugMissing && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            Tu canal no tiene un slug configurado. Completá el campo <strong>Slug (URL)</strong> en Perfil para poder usar el dashboard.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-6 items-start">
        {/* ── Sidebar nav ────────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-52 shrink-0 sticky top-4 gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left w-full',
                active === item.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : item.danger
                    ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.icon}
              {item.label}
              {active === item.id && <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
            </button>
          ))}
        </aside>

        {/* ── Mobile nav (horizontal scroll) ─────────────────────────────── */}
        <div className="lg:hidden w-full overflow-x-auto flex gap-1 pb-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
                active === item.id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : item.danger
                    ? 'text-destructive/70 border border-destructive/30'
                    : 'text-muted-foreground border border-border',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {active === 'plan' && <PlanSection plan={plan} channel={channel} />}
          {active === 'profile' && <ProfileSection user={user} />}
          {active === 'apikeys' && <ApiKeysSection />}
          {active === 'webhooks' && <WebhooksSection />}
          {active === 'alerts' && <AlertsSection />}
          {active === 'oauth' && <OAuthSection plan={plan} />}
          {active === 'billing' && <BillingSection plan={plan} />}
          {active === 'security' && <SecuritySection />}
          {active === 'danger' && <DangerSection />}
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <CardDescription className="mt-0.5">{description}</CardDescription>
            )}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ── Plan section ──────────────────────────────────────────────────────────────

function PlanSection({
  plan,
  channel,
}: {
  plan: 'STARTER' | 'PRO' | 'ENTERPRISE'
  channel: UserWithChannel['channel']
}) {
  const cfg = PLAN_CONFIG[plan]
  const limits = PLAN_LIMITS[plan]

  return (
    <div className="space-y-4">
      <Section
        title="Plan actual"
        description="Tu suscripción y límites incluidos"
      >
        <div className="space-y-4">
          {/* Current plan header */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn('px-3 py-1 text-sm font-semibold', cfg.color)}>
              {cfg.label}
            </Badge>
            <span className="text-lg font-bold">{cfg.price}</span>
            {plan !== 'ENTERPRISE' && (
              <span className="text-xs text-muted-foreground">/ mes</span>
            )}
          </div>

          {/* Limits grid */}
          <div className="grid grid-cols-2 gap-3">
            <LimitCard label="Bandwidth/mes" value={limits.bandwidth} />
            <LimitCard
              label="Streams simultáneos"
              value={limits.streams === Infinity ? 'Ilimitados' : String(limits.streams)}
            />
            <LimitCard
              label="Castify Video"
              value={limits.castifyVideo ? 'Incluido' : 'No incluido'}
              ok={limits.castifyVideo}
            />
            <LimitCard
              label="Multistreaming"
              value={limits.multistream ? 'Incluido' : 'No incluido'}
              ok={limits.multistream}
            />
          </div>

          {/* Features list */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Incluye</p>
            <ul className="space-y-1">
              {cfg.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {cfg.upgrade && (
              <Button className="gap-2">
                <CreditCard className="h-4 w-4" />
                Upgrade a {PLAN_CONFIG[cfg.upgrade as keyof typeof PLAN_CONFIG].label}
              </Button>
            )}
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {plan === 'ENTERPRISE' ? 'Contactar soporte' : 'Ver todos los planes'}
            </Button>
          </div>

          {plan !== 'ENTERPRISE' && (
            <p className="text-xs text-muted-foreground">
              Próxima renovación: 1 de mayo 2026
            </p>
          )}
        </div>
      </Section>
    </div>
  )
}

function LimitCard({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold mt-0.5', ok === false && 'text-muted-foreground/50')}>
        {value}
      </p>
    </div>
  )
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: UserWithChannel }) {
  const channel = user.channel
  const [name, setName] = useState(channel?.name ?? '')
  const [slug, setSlug] = useState(channel?.slug ?? '')
  const [slugError, setSlugError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const slugMissing = !channel?.slug

  function validateSlug(value: string): string {
    if (!value) return 'El slug es requerido'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return 'Solo minúsculas, números y guiones'
    if (value.length < 2) return 'Mínimo 2 caracteres'
    if (value.length > 50) return 'Máximo 50 caracteres'
    return ''
  }

  async function handleSave() {
    const slugErr = validateSlug(slug)
    if (slugErr) { setSlugError(slugErr); return }
    setSlugError('')
    setError('')
    setSaving(true)
    try {
      const updated = await api.auth.updateMyChannel({
        name: name || undefined,
        slug: slug || undefined,
      })
      if (updated.channel?.slug) {
        api.setTenant(updated.channel.slug)
        // Update the cookie so all subsequent requests use the new slug
        const Cookies = (await import('js-cookie')).default
        Cookies.set('castify_tenant', updated.channel.slug, { expires: 30, sameSite: 'lax', path: '/' })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Perfil" description="Información pública de tu canal">
      <div className="space-y-4">
        {slugMissing && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              Tu canal no tiene un slug asignado. Configuralo aquí para que el dashboard funcione correctamente.
            </AlertDescription>
          </Alert>
        )}

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground border overflow-hidden">
            {channel?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.logoUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              (channel?.name?.[0] ?? user.email[0]).toUpperCase()
            )}
          </div>
          <div className="space-y-1.5">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Cambiar avatar
            </Button>
            <p className="text-xs text-muted-foreground">JPG, PNG o GIF. Máx 2 MB.</p>
          </div>
        </div>

        <Separator />

        {/* Fields */}
        <div className="grid gap-4">
          <FormField label="Nombre del canal">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Slug (URL)">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground bg-muted rounded-l-md border border-r-0 px-3 py-2 h-9">
                  castify.tv/
                </span>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase())
                    setSlugError('')
                  }}
                  placeholder="mi-canal"
                  className="rounded-l-none"
                />
              </div>
              {slugError && <p className="text-xs text-destructive">{slugError}</p>}
            </div>
          </FormField>
          <FormField label="Email">
            <Input value={user.email} readOnly className="text-muted-foreground" />
          </FormField>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}

// ── API Keys section ──────────────────────────────────────────────────────────

interface ApiKey {
  id: string
  name: string
  key: string
  createdAt: string
  lastUsed: string | null
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: '1',
      name: 'Producción',
      key: 'cvk_live_' + 'a1b2c3d4e5f6789012345678',
      createdAt: '2026-01-15',
      lastUsed: '2026-04-12',
    },
  ])
  const [showKey, setShowKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [revokeId, setRevokeId] = useState<string | null>(null)

  function generateKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return 'cvk_live_' + Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }

  function handleCreate() {
    if (!newName.trim()) return
    const key: ApiKey = {
      id: Date.now().toString(),
      name: newName.trim(),
      key: generateKey(),
      createdAt: new Date().toISOString().split('T')[0]!,
      lastUsed: null,
    }
    setKeys((prev) => [...prev, key])
    setNewName('')
    setCreating(false)
  }

  async function copyKey(id: string, key: string) {
    await navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function revokeKey(id: string) {
    setKeys((prev) => prev.filter((k) => k.id !== id))
    setRevokeId(null)
  }

  const keyToRevoke = keys.find((k) => k.id === revokeId)

  return (
    <Section
      title="API Keys"
      description="Generá y revocá claves de acceso para la API de Castify"
      action={
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nueva key
        </Button>
      }
    >
      <div className="space-y-3">
        {creating && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <Label className="text-xs">Nombre de la key</Label>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Staging, Producción…"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                Crear
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tenés ninguna API key. Creá una para empezar.
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden divide-y">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 p-3 bg-background hover:bg-muted/20 transition-colors">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {showKey === k.id ? k.key : k.key.slice(0, 12) + '••••••••••••••••'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Creada {k.createdAt}
                    {k.lastUsed && ` · Último uso ${k.lastUsed}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={showKey === k.id ? 'Ocultar' : 'Mostrar'}
                    onClick={() => setShowKey(showKey === k.id ? null : k.id)}
                  >
                    {showKey === k.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Copiar"
                    onClick={() => void copyKey(k.id, k.key)}
                  >
                    {copiedId === k.id ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Revocar"
                    onClick={() => setRevokeId(k.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Las API keys permiten autenticarse en la API de Castify. Tratálas como contraseñas.
        </p>
      </div>

      {/* Revoke confirm dialog */}
      <Dialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revocar API key</DialogTitle>
            <DialogDescription>
              La key <strong>{keyToRevoke?.name}</strong> dejará de funcionar inmediatamente.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setRevokeId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => revokeKey(revokeId!)}>
              Revocar key
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  )
}

// ── Webhooks section ──────────────────────────────────────────────────────────

const WEBHOOK_EVENTS = [
  { id: 'stream.started', label: 'Stream iniciado' },
  { id: 'stream.ended', label: 'Stream finalizado' },
  { id: 'session.created', label: 'Sesión Castify Video creada' },
  { id: 'session.started', label: 'Sesión Castify Video iniciada' },
  { id: 'session.ended', label: 'Sesión Castify Video finalizada' },
  { id: 'bandwidth.alert', label: 'Alerta de bandwidth (>80%)' },
  { id: 'vod.processed', label: 'VOD procesado' },
]

function WebhooksSection() {
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['stream.started', 'stream.ended'])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)
  const [saved, setSaved] = useState(false)

  function toggleEvent(id: string) {
    setSelectedEvents((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  async function handleTest() {
    if (!url) return
    setTesting(true)
    setTestResult(null)
    await new Promise((r) => setTimeout(r, 1200))
    setTesting(false)
    setTestResult(Math.random() > 0.3 ? 'ok' : 'error')
    setTimeout(() => setTestResult(null), 5000)
  }

  async function handleSave() {
    await new Promise((r) => setTimeout(r, 500))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Section title="Webhooks" description="Recibí notificaciones en tu servidor cuando ocurran eventos">
      <div className="space-y-4">
        {/* URL */}
        <FormField label="URL del endpoint">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://tu-servidor.com/webhook"
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!url || testing}
              onClick={() => void handleTest()}
              className="gap-1.5 shrink-0"
            >
              {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Test
            </Button>
          </div>
          {testResult === 'ok' && (
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <Check className="h-3 w-3" /> Webhook respondió 200 OK
            </p>
          )}
          {testResult === 'error' && (
            <p className="text-xs text-destructive mt-1">
              Error al conectar con el endpoint. Verificá la URL.
            </p>
          )}
        </FormField>

        {/* Events */}
        <div>
          <Label className="text-sm">Eventos a recibir</Label>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {WEBHOOK_EVENTS.map((ev) => (
              <label
                key={ev.id}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-sm">{ev.label}</span>
                <code className="text-xs text-muted-foreground ml-auto font-mono">{ev.id}</code>
              </label>
            ))}
          </div>
        </div>

        {/* History (mock) */}
        <div>
          <Label className="text-sm text-muted-foreground">Últimas llamadas</Label>
          <div className="mt-2 rounded-lg border divide-y">
            {[
              { event: 'stream.started', status: 200, time: 'hace 2h' },
              { event: 'stream.ended', status: 200, time: 'hace 2h' },
              { event: 'bandwidth.alert', status: 500, time: 'hace 1d' },
            ].map((call, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span
                  className={cn(
                    'font-mono font-bold',
                    call.status === 200 ? 'text-green-400' : 'text-destructive',
                  )}
                >
                  {call.status}
                </span>
                <span className="font-mono text-muted-foreground">{call.event}</span>
                <span className="ml-auto text-muted-foreground">{call.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} className="gap-2">
            Guardar webhook
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}

// ── Alerts section ────────────────────────────────────────────────────────────

function AlertsSection() {
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [bandwidthThreshold, setBandwidthThreshold] = useState([80])
  const [concurrentAlert, setConcurrentAlert] = useState(false)
  const [sessionAlert, setSessionAlert] = useState(true)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    await new Promise((r) => setTimeout(r, 400))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <Section title="Alertas" description="Configurá cuándo y cómo recibir notificaciones">
      <div className="space-y-5">
        <ToggleRow
          label="Alertas por email"
          description="Recibí notificaciones en tu dirección de email registrada"
          checked={emailAlerts}
          onCheckedChange={setEmailAlerts}
        />

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Umbral de bandwidth</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alertar cuando el uso mensual supere el {bandwidthThreshold[0]}%
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-sm">
              {bandwidthThreshold[0]}%
            </Badge>
          </div>
          <Slider
            min={50}
            max={95}
            step={5}
            value={bandwidthThreshold}
            onValueChange={setBandwidthThreshold}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50%</span>
            <span>95%</span>
          </div>
        </div>

        <Separator />

        <ToggleRow
          label="Límite de streams simultáneos"
          description="Alertar cuando llegues al 90% del límite de streams concurrentes"
          checked={concurrentAlert}
          onCheckedChange={setConcurrentAlert}
        />

        <ToggleRow
          label="Nueva sesión Castify Video"
          description="Notificar cuando se cree o inicie una nueva sesión privada"
          checked={sessionAlert}
          onCheckedChange={setSessionAlert}
        />

        <Separator />

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} className="gap-2">
            Guardar preferencias
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
        </div>
      </div>
    </Section>
  )
}

// ── OAuth section ─────────────────────────────────────────────────────────────

const OAUTH_PLATFORMS = [
  {
    id: 'youtube',
    label: 'YouTube',
    icon: <PlayCircle className="h-5 w-5 text-red-400" />,
    description: 'Multistream directo a YouTube Live',
    color: 'border-red-500/30 bg-red-500/5',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: <Globe className="h-5 w-5 text-blue-400" />,
    description: 'Transmitir a Facebook Live',
    color: 'border-blue-500/30 bg-blue-500/5',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: <Camera className="h-5 w-5 text-pink-400" />,
    description: 'Instagram Live con RTMP',
    color: 'border-pink-500/30 bg-pink-500/5',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: <Music2 className="h-5 w-5 text-sky-400" />,
    description: 'TikTok LIVE Studio',
    color: 'border-sky-500/30 bg-sky-500/5',
  },
  {
    id: 'twitch',
    label: 'Twitch',
    icon: <Gamepad2 className="h-5 w-5 text-purple-400" />,
    description: 'Stream simultáneo a Twitch',
    color: 'border-purple-500/30 bg-purple-500/5',
  },
]

function OAuthSection({ plan }: { plan: 'STARTER' | 'PRO' | 'ENTERPRISE' }) {
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const canMultistream = plan !== 'STARTER'

  return (
    <Section
      title="Integraciones OAuth"
      description="Conectá plataformas externas para multistreaming automático"
    >
      <div className="space-y-3">
        {!canMultistream && (
          <Alert variant="warning">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              El multistreaming requiere el plan <strong>Pro</strong> o superior.{' '}
              <button className="underline font-medium">Hacer upgrade</button>
            </AlertDescription>
          </Alert>
        )}

        {OAUTH_PLATFORMS.map((platform) => {
          const isConnected = connected.has(platform.id)
          return (
            <div
              key={platform.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                isConnected ? platform.color : 'border-border bg-background',
              )}
            >
              <div className="shrink-0">{platform.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{platform.label}</p>
                <p className="text-xs text-muted-foreground">{platform.description}</p>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Conectado
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-7 text-xs"
                    disabled={!canMultistream}
                    onClick={() => setConnected((s) => { const n = new Set(s); n.delete(platform.id); return n })}
                  >
                    Desconectar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 shrink-0"
                  disabled={!canMultistream}
                  onClick={() => setConnected((s) => new Set([...s, platform.id]))}
                >
                  <Link2 className="h-3 w-3" />
                  Conectar
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Billing section ───────────────────────────────────────────────────────────

const MONTH_NAMES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function BillingSection({ plan }: { plan: 'STARTER' | 'PRO' | 'ENTERPRISE' }) {
  const [history, setHistory] = useState<CastifyVideoBillingRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.castifyVideo.getBillingHistory()
      .then(setHistory)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  const planCfg = PLAN_CONFIG[plan]

  return (
    <div className="space-y-4">
      {/* Subscription info */}
      <Section title="Suscripción" description="Estado de tu plan y próximo pago">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
            <div>
              <p className="text-sm font-medium">Plan {planCfg.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Facturación mensual</p>
            </div>
            <span className="text-lg font-bold">{planCfg.price}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Próximo pago</p>
              <p className="font-medium mt-0.5">1 May 2026</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Método de pago</p>
              <p className="font-medium mt-0.5">•••• •••• •••• 4242</p>
            </div>
          </div>

          <Button variant="outline" size="sm" className="gap-2">
            <CreditCard className="h-3.5 w-3.5" />
            Actualizar método de pago
          </Button>
        </div>
      </Section>

      {/* Castify Video billing history */}
      <Section title="Historial Castify Video" description="Facturas mensuales del servicio de sesiones privadas">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sin facturas disponibles. Las facturas aparecerán después del primer mes.
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Período</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sesiones</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">
                      {MONTH_NAMES[b.month]} {b.year}
                    </td>
                    <td className="px-3 py-2 text-right">{b.sessionCount}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      ${b.totalCost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          b.paid
                            ? 'text-green-400 border-green-500/30 bg-green-500/10'
                            : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
                        )}
                      >
                        {b.paid ? 'Pagado' : 'Pendiente'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Descargar PDF">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Security section ──────────────────────────────────────────────────────────

function SecuritySection() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [changingPw, setChangingPw] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [twoFa, setTwoFa] = useState(false)

  const MOCK_SESSIONS = [
    { id: '1', device: 'Chrome · macOS', location: 'Buenos Aires, AR', lastSeen: 'Ahora', current: true },
    { id: '2', device: 'Safari · iPhone', location: 'Buenos Aires, AR', lastSeen: 'hace 2h', current: false },
    { id: '3', device: 'Firefox · Windows', location: 'Córdoba, AR', lastSeen: 'hace 3d', current: false },
  ]
  const [sessions, setSessions] = useState(MOCK_SESSIONS)

  async function handleChangePw() {
    setPwError(null)
    if (newPw !== confirmPw) { setPwError('Las contraseñas no coinciden'); return }
    if (newPw.length < 8) { setPwError('La contraseña debe tener al menos 8 caracteres'); return }
    setChangingPw(true)
    await new Promise((r) => setTimeout(r, 900))
    setChangingPw(false)
    setPwSaved(true)
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setTimeout(() => setPwSaved(false), 3000)
  }

  return (
    <div className="space-y-4">
      {/* Password change */}
      <Section title="Cambiar contraseña" description="Actualizá tu contraseña de acceso">
        <div className="space-y-3">
          {pwError && (
            <Alert variant="destructive">
              <AlertDescription>{pwError}</AlertDescription>
            </Alert>
          )}
          <FormField label="Contraseña actual">
            <Input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="••••••••"
            />
          </FormField>
          <FormField label="Nueva contraseña">
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </FormField>
          <FormField label="Confirmar nueva contraseña">
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repetí la nueva contraseña"
            />
          </FormField>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void handleChangePw()}
              disabled={changingPw || !currentPw || !newPw || !confirmPw}
              className="gap-2"
            >
              {changingPw && <RefreshCw className="h-4 w-4 animate-spin" />}
              Cambiar contraseña
            </Button>
            {pwSaved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <Check className="h-3.5 w-3.5" /> Contraseña actualizada
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* 2FA */}
      <Section title="Autenticación de dos factores" description="Añadí una capa extra de seguridad a tu cuenta">
        <div className="space-y-3">
          <ToggleRow
            label="Activar 2FA"
            description="Usá una app de autenticación (Google Authenticator, Authy) al iniciar sesión"
            checked={twoFa}
            onCheckedChange={setTwoFa}
          />
          {twoFa && (
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Escaneá el QR con tu app de autenticación para completar la configuración.{' '}
                <span className="text-muted-foreground text-xs">(Implementación pendiente)</span>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </Section>

      {/* Active sessions */}
      <Section title="Sesiones activas" description="Dispositivos donde tu cuenta está iniciada">
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{s.device}</p>
                  {s.current && (
                    <Badge variant="secondary" className="text-xs text-green-400">
                      Actual
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.location} · {s.lastSeen}
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive text-xs h-7"
                  onClick={() => setSessions((prev) => prev.filter((x) => x.id !== s.id))}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Cerrar
                </Button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Danger section ────────────────────────────────────────────────────────────

function DangerSection() {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  async function handleExport() {
    setExporting(true)
    await new Promise((r) => setTimeout(r, 1500))
    setExporting(false)
    setExported(true)
    setTimeout(() => setExported(false), 5000)
  }

  return (
    <div className="space-y-4">
      {/* Export data */}
      <Section title="Exportar datos" description="Descargá una copia de toda tu información (GDPR)">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Incluye: perfil, contenidos, sesiones, analytics, facturación y configuración.
            El archivo estará disponible en tu email en hasta 24 horas.
          </p>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : exported ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exporting ? 'Preparando exportación…' : exported ? 'Solicitud enviada' : 'Exportar mis datos'}
          </Button>
        </div>
      </Section>

      {/* Delete account */}
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive">Zona peligrosa</CardTitle>
          <CardDescription>Acciones irreversibles — procedé con precaución</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Borrar cuenta</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Elimina permanentemente tu canal, todos los contenidos, sesiones y datos de facturación.
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Borrar cuenta
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm('') }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <TriangleAlert className="h-5 w-5" />
              Borrar cuenta definitivamente
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1">
              <span className="block">
                Esta acción <strong>no se puede deshacer</strong>. Se eliminarán permanentemente:
              </span>
              <ul className="list-disc list-inside text-sm space-y-0.5 text-muted-foreground">
                <li>Tu canal y todos sus contenidos</li>
                <li>Streams, VODs y sesiones Castify Video</li>
                <li>Historial de analytics y facturación</li>
                <li>API keys y configuraciones</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <FormField label='Escribí "borrar mi cuenta" para confirmar'>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="borrar mi cuenta"
                className="border-destructive/40 focus-visible:ring-destructive"
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm('') }}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={deleteConfirm !== 'borrar mi cuenta'}
              >
                Borrar cuenta permanentemente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0 mt-0.5" />
    </div>
  )
}
