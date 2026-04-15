import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { PublicChannel, PublicContent } from '@castify/types';
import { CastifyPlayer } from '@/components/castify/castify-player';

interface PageProps {
  params: { tenant: string; slug: string };
}

export default async function VodPage({ params }: PageProps): Promise<React.JSX.Element> {
  let channel: PublicChannel;
  let content: PublicContent | undefined;

  try {
    channel = await serverFetch<PublicChannel>(`/api/public/channels/${params.tenant}`);
    content = channel.contents.find((c) => c.id === params.slug && c.type === 'VOD');
    if (!content) notFound();
  } catch {
    notFound();
  }

  const isReady = content.status === 'ACTIVE' && !!content.hlsUrl;

  return (
    <main className="min-h-screen px-8 py-10 max-w-4xl mx-auto">
      <a
        href={`/${params.tenant}`}
        className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 transition-colors"
      >
        ← Volver a {channel.name}
      </a>

      {isReady ? (
        <CastifyPlayer
          src={content.hlsUrl!}
          isLive={false}
          contentId={content.id}
          channelId={channel.id}
          className="rounded-2xl mb-8"
        />
      ) : (
        <div className="w-full aspect-video rounded-2xl border border-border flex flex-col items-center justify-center gap-3 bg-muted/30 mb-8">
          {content.status === 'PROCESSING' ? (
            <>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Procesando video...</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Video no disponible</p>
          )}
        </div>
      )}

      <h1 className="text-3xl font-bold">{content.title}</h1>
      <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
        <span className="uppercase tracking-widest">VOD</span>
        {content.durationSec && (
          <span>
            {Math.floor(content.durationSec / 3600) > 0
              ? `${Math.floor(content.durationSec / 3600)}h ${Math.floor((content.durationSec % 3600) / 60)}m`
              : `${Math.floor(content.durationSec / 60)}m ${content.durationSec % 60}s`}
          </span>
        )}
      </div>
    </main>
  );
}
