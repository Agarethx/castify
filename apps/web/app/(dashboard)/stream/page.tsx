import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { ChannelWithContents, Content } from '@castify/types';
import { Card, CardContent } from '@/components/ui/card';
import { StreamMonitor } from './_components/stream-monitor';
import { StreamTabs } from './_components/stream-tabs';

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

      {/* Tabs: browser streamer + encoder config */}
      {liveContent ? (
        <StreamTabs content={liveContent} rtmpUrl={rtmpUrl} />
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
