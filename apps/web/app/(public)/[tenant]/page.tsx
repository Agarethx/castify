import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { PublicChannel } from '@castify/types';
import { StreamStatusBadge } from '@/components/castify/stream-status-badge';
import { CastifyPlayer } from '@/components/castify/castify-player';

interface PageProps {
  params: { tenant: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const channel = await serverFetch<PublicChannel>(`/api/public/channels/${params.tenant}`);
    return {
      title: `${channel.name} — Castify`,
      openGraph: {
        title: channel.name,
        images: channel.logoUrl ? [{ url: channel.logoUrl }] : [],
      },
    };
  } catch {
    return { title: 'Canal no encontrado — Castify' };
  }
}

export default async function ChannelHomePage({ params }: PageProps): Promise<React.JSX.Element> {
  let channel: PublicChannel;

  try {
    channel = await serverFetch<PublicChannel>(`/api/public/channels/${params.tenant}`);
    if (!channel.isActive) notFound();
  } catch {
    notFound();
  }

  const liveContent = channel.contents.find((c) => c.type === 'LIVE');
  const isLive = liveContent?.status === 'ACTIVE';

  return (
    <main className="min-h-screen" style={{ '--primary': channel.primaryColor } as React.CSSProperties}>
      {/* Header */}
      <header className="px-8 py-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          {channel.logoUrl && (
            <img src={channel.logoUrl} alt={channel.name} className="h-10 w-auto object-contain" />
          )}
          <h1 className="text-2xl font-bold">{channel.name}</h1>
        </div>
        {liveContent && <StreamStatusBadge status={liveContent.status} />}
      </header>

      {/* Player */}
      <div className="px-8 pt-8">
        {isLive && liveContent?.hlsUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-medium text-green-400">EN VIVO</span>
            </div>
            <CastifyPlayer src={liveContent.hlsUrl} autoplay className="rounded-2xl" />
          </div>
        ) : (
          <div className="w-full aspect-video rounded-2xl border border-border flex flex-col items-center justify-center gap-3 bg-muted/30">
            <p className="text-muted-foreground font-medium">Próximamente</p>
            <p className="text-xs text-muted-foreground">Este canal no está transmitiendo en este momento</p>
          </div>
        )}
      </div>

      {/* VOD content */}
      {channel.contents.filter((c) => c.type === 'VOD').length > 0 && (
        <section className="px-8 py-10">
          <h2 className="text-xl font-semibold mb-6">Contenido disponible</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {channel.contents
              .filter((c) => c.type === 'VOD')
              .map((item) => (
                <li key={item.id}>
                  <a
                    href={`/${params.tenant}/vod/${item.id}`}
                    className="block rounded-xl overflow-hidden bg-card border border-border hover:bg-accent/30 transition group"
                  >
                    <div className="w-full aspect-video bg-muted/50" />
                    <div className="p-4">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">VOD</span>
                      <h3 className="mt-1 font-semibold text-sm">{item.title}</h3>
                      {item.durationSec && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.floor(item.durationSec / 60)}m
                        </p>
                      )}
                    </div>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
