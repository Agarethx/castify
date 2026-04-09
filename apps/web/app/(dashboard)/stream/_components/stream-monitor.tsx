'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContentStatus, StreamStatusResponse } from '@castify/types';
import { api } from '@/lib/api';
import { StreamStatusBadge } from '@/components/castify/stream-status-badge';
import { CastifyPlayer } from '@/components/castify/castify-player';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StreamMonitorProps {
  streamKey: string;
  initialStatus: ContentStatus;
  initialHlsUrl: string | null;
}

export function StreamMonitor({ streamKey, initialStatus, initialHlsUrl }: StreamMonitorProps) {
  const [status, setStatus] = useState<ContentStatus>(initialStatus);
  const [hlsUrl, setHlsUrl] = useState<string | null>(initialHlsUrl);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const data: StreamStatusResponse = await api.streaming.getStatus(streamKey);
        setStatus(data.content.status);
        setHlsUrl(data.content.hlsUrl);
      } catch {
        // silently ignore polling errors
      }
    }

    intervalRef.current = setInterval(() => void poll(), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [streamKey]);

  const isActive = status === 'ACTIVE';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Preview en vivo</CardTitle>
          <StreamStatusBadge status={status} />
        </div>
        <CardDescription>
          {isActive
            ? 'Esta vista es solo para monitoreo. La latencia puede ser de 10–30 segundos.'
            : 'El preview aparecerá automáticamente cuando el stream esté activo.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isActive && hlsUrl ? (
          <CastifyPlayer src={hlsUrl} autoplay muted className="rounded-lg" />
        ) : (
          <div className="w-full aspect-video rounded-lg bg-muted/40 border border-border flex flex-col items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-zinc-500" />
            <p className="text-sm text-muted-foreground">Sin señal</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
