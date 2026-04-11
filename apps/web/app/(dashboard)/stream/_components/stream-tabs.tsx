'use client';

import type { Content } from '@castify/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrowserStreamer } from '@/components/castify/browser-streamer';
import { StreamKeyInput } from '@/components/castify/stream-key-input';
import { CopyButton } from '@/components/castify/copy-button';
import { Monitor, Webcam } from 'lucide-react';

interface StreamTabsProps {
  content: Content;
  rtmpUrl: string;
}

export function StreamTabs({ content, rtmpUrl }: StreamTabsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cómo transmitir</CardTitle>
        <CardDescription>
          Elegí cómo preferís enviar tu señal a Castify
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="browser">
          <TabsList className="mb-5 w-full justify-start">
            <TabsTrigger value="browser" className="gap-2">
              <Webcam className="h-4 w-4" />
              Desde el browser
            </TabsTrigger>
            <TabsTrigger value="encoder" className="gap-2">
              <Monitor className="h-4 w-4" />
              Con encoder
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Browser WebRTC ── */}
          <TabsContent value="browser" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Transmití directamente desde tu cámara web, sin instalar ningún programa.
            </p>
            <BrowserStreamer streamKey={content.streamKey} />
          </TabsContent>

          {/* ── Tab 2: Encoder OBS / hardware ── */}
          <TabsContent value="encoder" className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Para transmisiones profesionales con equipos dedicados (OBS, Teradek, vMix, Wirecast).
            </p>

            {/* URL del servidor */}
            <div className="space-y-2">
              <p className="text-sm font-medium">URL del servidor RTMP</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                  {rtmpUrl}
                </code>
                <CopyButton value={rtmpUrl} />
              </div>
            </div>

            {/* Stream Key */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Stream Key</p>
              <StreamKeyInput value={content.streamKey} />
              <p className="text-xs text-muted-foreground">
                No compartas esta clave — da acceso directo a tu stream.
              </p>
            </div>

            {/* Instrucciones por encoder */}
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-1">
                <p className="text-xs font-semibold">OBS Studio</p>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                  <li>Ajustes → Emisión → Tipo de servicio: <strong>Personalizado</strong></li>
                  <li>Servidor: pegá la URL RTMP de arriba</li>
                  <li>Clave de retransmisión: pegá el Stream Key</li>
                  <li>Clic en <strong>Iniciar transmisión</strong></li>
                </ol>
              </div>
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-1">
                <p className="text-xs font-semibold">Teradek / Wirecast / vMix</p>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                  <li>En la configuración de destino, elegir <strong>RTMP personalizado</strong></li>
                  <li>URL de servidor: la URL RTMP de arriba</li>
                  <li>Stream Name / Key: el Stream Key de arriba</li>
                  <li>Iniciar transmisión</li>
                </ol>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
