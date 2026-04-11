'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Phase =
  | { type: 'idle' }
  | { type: 'selected'; file: File }
  | { type: 'uploading'; pct: number }
  | { type: 'processing'; contentId: string }
  | { type: 'done'; contentId: string; hlsUrl: string }
  | { type: 'error'; message: string };

const ACCEPTED = '.mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface VodUploaderProps {
  onComplete?: (contentId: string, hlsUrl: string) => void;
}

export function VodUploader({ onComplete }: VodUploaderProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ type: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    setPhase({ type: 'selected', file });
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async () => {
    if (phase.type !== 'selected') return;
    const { file } = phase;

    setPhase({ type: 'uploading', pct: 0 });

    try {
      const { contentId } = await api.vod.upload(file, (pct) => {
        setPhase({ type: 'uploading', pct });
      });

      setPhase({ type: 'processing', contentId });
      startPolling(contentId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir el archivo';
      setPhase({ type: 'error', message: msg });
    }
  }, [phase]);

  // ── Polling ────────────────────────────────────────────────────────────────

  const startPolling = useCallback((contentId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const result = await api.vod.getStatus(contentId);

        if (result.status === 'ACTIVE' && result.hlsUrl) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPhase({ type: 'done', contentId, hlsUrl: result.hlsUrl });
          onComplete?.(contentId, result.hlsUrl);
        } else if (result.status === 'ERROR') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPhase({ type: 'error', message: 'El procesamiento de video falló' });
        }
      } catch {
        // keep polling silently
      }
    }, 3000);
  }, [onComplete]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase({ type: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase.type === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
          <svg className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-green-400">¡Video listo!</p>
        <div className="flex gap-2">
          <a
            href={phase.hlsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            Ver playlist HLS
          </a>
          <span className="text-muted-foreground">·</span>
          <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Subir otro
          </button>
        </div>
      </div>
    );
  }

  if (phase.type === 'processing') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Procesando video con FFmpeg...</p>
        <p className="text-xs text-muted-foreground/60">Esto puede tardar varios minutos según el tamaño del archivo</p>
      </div>
    );
  }

  if (phase.type === 'uploading') {
    return (
      <div className="space-y-4 py-4">
        <p className="text-sm text-center text-muted-foreground">Subiendo archivo...</p>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${phase.pct}%` }}
          />
        </div>
        <p className="text-xs text-center text-muted-foreground">{phase.pct}%</p>
      </div>
    );
  }

  if (phase.type === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-destructive">{phase.message}</p>
        <Button variant="outline" size="sm" onClick={handleReset}>
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50 hover:bg-muted/40'
        }`}
      >
        <svg
          className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm font-medium text-foreground">
          {phase.type === 'selected' ? phase.file.name : 'Arrastrá o hacé clic para seleccionar'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {phase.type === 'selected'
            ? formatBytes(phase.file.size)
            : 'MP4, MOV o AVI · máximo 2 GB'}
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleInputChange}
      />

      {phase.type === 'selected' && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void handleUpload()}>
            Subir video
          </Button>
          <Button variant="outline" onClick={handleReset}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
