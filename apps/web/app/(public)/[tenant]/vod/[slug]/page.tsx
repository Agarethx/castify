import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { Channel, Content } from '@castify/types';

interface PageProps {
  params: { tenant: string; slug: string };
}

export default async function VodPage({ params }: PageProps): Promise<React.JSX.Element> {
  let channel: Channel;
  let content: Content;

  try {
    channel = await api.channels.findBySlug(params.tenant);
    content = await api.content.findBySlug(channel.id, params.slug);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen px-8 py-10 max-w-4xl mx-auto">
      <a href={`/${params.tenant}`} className="text-sm text-white/50 hover:text-white mb-6 inline-block">
        ← Back to {channel.name}
      </a>

      <div className="aspect-video w-full bg-white/5 rounded-2xl flex items-center justify-center mb-8">
        <p className="text-white/30">Player placeholder — integrate Peer5 here</p>
      </div>

      <h1 className="text-3xl font-bold">{content.title}</h1>
      <div className="flex gap-4 mt-3 text-sm text-white/40">
        <span className="uppercase tracking-widest">{content.type}</span>
        {content.duration && <span>{Math.floor(content.duration / 60)}m</span>}
        {content.publishedAt && <span>{new Date(content.publishedAt).toLocaleDateString()}</span>}
      </div>
    </main>
  );
}
