import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { ChannelWithContents, Content } from '@castify/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StreamKeyInput } from '@/components/castify/stream-key-input';
import { CopyButton } from '@/components/castify/copy-button';
import { StreamMonitor } from './_components/stream-monitor';

const RTMP_HOST = process.env['RTMP_HOST'] ?? 'localhost';

export default async function StreamPage(): Promise<React.JSX.Element> {
  const cookieStore = cookies();
  const token = cookieStore.get('castify_access_token')?.value;
  const tenantSlug = cookieStore.get('castify_tenant')?.value;

  if (!token) redirect('/login');

  let channel: ChannelWithContents;
  try {
    channel = await serverFetch<ChannelWithContents>('/api/channels/me', token, tenantSlug);
  } catch {
    redirect('/login');
  }

  const liveContent: Content | undefined = channel.contents.find((c) => c.type === 'LIVE');
  const rtmpUrl = `rtmp://${RTMP_HOST}/live`;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stream</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura tu encoder para comenzar a transmitir
        </p>
      </div>

      {/* Configuración del encoder */}
      {liveContent ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuración del encoder</CardTitle>
            <CardDescription>
              Ingresá estos datos en OBS, Streamlabs o tu encoder de hardware
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* URL del servidor */}
            <div className="space-y-2">
              <p className="text-sm font-medium">URL del servidor</p>
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
              <StreamKeyInput value={liveContent.streamKey} />
              <p className="text-xs text-muted-foreground">
                No compartas esta clave — da acceso directo a tu stream
              </p>
            </div>

            {/* Instrucciones OBS */}
            <div className="rounded-md border border-border bg-muted/40 p-4 space-y-1">
              <p className="text-xs font-medium">En OBS Studio:</p>
              <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-0.5">
                <li>Ajustes → Emisión → Tipo de servicio: Personalizado</li>
                <li>Pegá la URL del servidor en «Servidor»</li>
                <li>Pegá el Stream Key en «Clave de retransmisión»</li>
                <li>Hacé clic en «Iniciar transmisión»</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No hay un stream LIVE configurado para este canal.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Monitor con polling — client component */}
      {liveContent && (
        <StreamMonitor
          streamKey={liveContent.streamKey}
          contentId={liveContent.id}
          channelId={channel.id}
          initialStatus={liveContent.status}
          initialHlsUrl={liveContent.hlsUrl}
        />
      )}
    </div>
  );
}
