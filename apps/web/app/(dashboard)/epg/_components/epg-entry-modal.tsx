'use client'

import { useEffect, useState } from 'react'
import type { EPGEntry, CreateEPGEntryDto } from '@/lib/api'
import type { Content } from '@castify/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Clock, RefreshCw, X } from 'lucide-react'
import { fmtDuration } from './epg-container'

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRES = ['Noticias', 'Deportes', 'Entretenimiento', 'Música', 'Educación', 'Documentales', 'Series', 'Películas', 'Infantil', 'Otros']
const RATINGS = ['ATP', 'G', 'PG', 'PG-13', '+13', '+16', 'R', '+18', 'NC-17']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Date to the value required by <input type="datetime-local"> */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Derive a starting datetime string for a given date at a specific hour */
function defaultDatetime(date: string, hour: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date}T${pad(hour)}:00`
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string
  description: string
  contentId: string
  startTime: string  // datetime-local format
  endTime: string
  genre: string
  rating: string
  tags: string       // comma-separated
  posterUrl: string
}

function emptyForm(date: string): FormState {
  const now = new Date()
  const hour = now.getHours()
  return {
    title: '',
    description: '',
    contentId: '',
    startTime: defaultDatetime(date, hour),
    endTime: defaultDatetime(date, hour + 1),
    genre: '',
    rating: '',
    tags: '',
    posterUrl: '',
  }
}

function entryToForm(entry: EPGEntry): FormState {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>
  return {
    title: entry.title,
    description: entry.description ?? '',
    contentId: entry.contentId ?? '',
    startTime: toDatetimeLocal(new Date(entry.startTime)),
    endTime: toDatetimeLocal(new Date(entry.endTime)),
    genre: (meta.genre as string) ?? '',
    rating: (meta.rating as string) ?? '',
    tags: ((meta.tags as string[]) ?? []).join(', '),
    posterUrl: (meta.posterUrl as string) ?? '',
  }
}

// ── EpgEntryModal ─────────────────────────────────────────────────────────────

interface EpgEntryModalProps {
  open: boolean
  onClose: () => void
  onSave: (dto: CreateEPGEntryDto, id?: string) => Promise<void>
  editEntry: EPGEntry | null
  duplicateEntry: EPGEntry | null
  contents: Content[]
  selectedDate: string
}

export function EpgEntryModal({
  open,
  onClose,
  onSave,
  editEntry,
  duplicateEntry,
  contents,
  selectedDate,
}: EpgEntryModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm(selectedDate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when opening
  useEffect(() => {
    if (!open) return
    if (editEntry) {
      setForm(entryToForm(editEntry))
    } else if (duplicateEntry) {
      const f = entryToForm(duplicateEntry)
      // Keep same times (user adjusts them)
      setForm({ ...f, title: `${f.title} (copia)` })
    } else {
      setForm(emptyForm(selectedDate))
    }
    setError(null)
  }, [open, editEntry, duplicateEntry, selectedDate])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Auto-calculate duration
  const startMs = form.startTime ? new Date(form.startTime).getTime() : 0
  const endMs = form.endTime ? new Date(form.endTime).getTime() : 0
  const durationMinutes = startMs && endMs ? Math.round((endMs - startMs) / 60_000) : null

  // Validation
  const titleError = form.title.trim().length > 0 && form.title.trim().length < 3
    ? 'Mínimo 3 caracteres'
    : null
  const timeError = durationMinutes !== null && durationMinutes <= 0
    ? 'El fin debe ser posterior al inicio'
    : null
  const descError = form.description.length > 500
    ? `Máximo 500 caracteres (${form.description.length}/500)`
    : null

  const isValid =
    form.title.trim().length >= 3 &&
    !timeError &&
    !descError &&
    durationMinutes !== null &&
    durationMinutes > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setSaving(true)
    setError(null)
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const metadata: Record<string, unknown> = {}
      if (form.genre) metadata['genre'] = form.genre
      if (form.rating) metadata['rating'] = form.rating
      if (tags.length) metadata['tags'] = tags
      if (form.posterUrl) metadata['posterUrl'] = form.posterUrl

      const dto: CreateEPGEntryDto = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        contentId: form.contentId || undefined,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        metadata: Object.keys(metadata).length ? metadata : undefined,
      }

      await onSave(dto, editEntry?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const title = editEntry ? 'Editar entrada' : duplicateEntry ? 'Duplicar entrada' : 'Nueva entrada'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 mt-2">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Title */}
          <FormField label="Título *">
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Nombre del programa"
              maxLength={100}
              autoFocus
            />
            {titleError && <FieldError>{titleError}</FieldError>}
          </FormField>

          {/* Description */}
          <FormField label="Descripción">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descripción breve del programa…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
            {descError && <FieldError>{descError}</FieldError>}
          </FormField>

          {/* Content selector */}
          <FormField label="Contenido vinculado">
            <Select value={form.contentId} onValueChange={(v) => set('contentId', v === '_none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Sin contenido (solo entrada)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin contenido</SelectItem>
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
          </FormField>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Inicio *">
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </FormField>
            <FormField label="Fin *">
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </FormField>
          </div>

          {/* Duration preview */}
          {durationMinutes !== null && (
            <div className="flex items-center gap-2">
              {timeError ? (
                <FieldError>{timeError}</FieldError>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Duración calculada:
                  <Badge variant="secondary" className="font-mono">
                    {fmtDuration(durationMinutes)}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Metadata (opcional)
            </p>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Género">
                <Select value={form.genre} onValueChange={(v) => set('genre', v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Clasificación">
                <Select value={form.rating} onValueChange={(v) => set('rating', v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Tags (separados por coma)">
              <Input
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="tech, noticias, deportes…"
                className="h-8 text-xs"
              />
            </FormField>

            <FormField label="URL del poster">
              <Input
                type="url"
                value={form.posterUrl}
                onChange={(e) => set('posterUrl', e.target.value)}
                placeholder="https://…/poster.jpg"
                className="h-8 text-xs"
              />
            </FormField>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!isValid || saving} className="gap-2">
              {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
              {saving ? 'Guardando…' : editEntry ? 'Guardar cambios' : 'Crear entrada'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-destructive mt-1">{children}</p>
}
