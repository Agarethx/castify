import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { PublicChannel, PublicContent } from '@castify/types';

interface PageProps {
  params: { tenant: string; slug: string };
}

export default async function VodPage({ params }: PageProps): Promise<React.JSX.Element> {
  let channel: PublicChannel;
  let content: PublicContent | undefined;

  try {
    channel = await serverFetch<PublicChannel>(`/api/public/channels/${params.tenant}`);
    content = channel.contents.find((c) => c.id === params.slug);
    if (!content) notFound();
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen px-8 py-10 max-w-4xl mx-auto">
      <a href={`/${params.tenant}`} className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block">
        ← Volver a {channel.name}
      </a>

      <div className="aspect-video w-full bg-muted rounded-2xl flex items-center justify-center mb-8 border border-border">
        <p className="text-muted-foreground text-sm">Player P2P — próximo módulo</p>
      </div>

      <h1 className="text-3xl font-bold">{content.title}</h1>
      <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
        <span className="uppercase tracking-widest">{content.type}</span>
        {content.durationSec && <span>{Math.floor(content.durationSec / 60)}m</span>}
      </div>
    </main>
  );
}
