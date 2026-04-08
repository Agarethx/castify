import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import type { Channel, Content } from '@castify/types';

interface PageProps {
  params: { tenant: string };
}

export default async function ChannelHomePage({ params }: PageProps): Promise<React.JSX.Element> {
  let channel: Channel;
  let content: Content[];

  try {
    channel = await api.channels.findBySlug(params.tenant);
    content = await api.content.findByChannel(channel.id);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen" style={{ '--primary': channel.primaryColor } as React.CSSProperties}>
      <header className="flex items-center gap-4 px-8 py-6 border-b border-white/10">
        {channel.logoUrl && (
          <img src={channel.logoUrl} alt={channel.name} className="h-10 w-auto object-contain" />
        )}
        <h1 className="text-2xl font-bold">{channel.name}</h1>
      </header>

      <section className="px-8 py-10">
        <h2 className="text-xl font-semibold mb-6">Content</h2>
        {content.length === 0 ? (
          <p className="text-white/50">No published content yet.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.map((item) => (
              <li key={item.id}>
                <a
                  href={`/${params.tenant}/vod/${item.slug}`}
                  className="block rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition"
                >
                  {item.thumbnailUrl && (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full aspect-video object-cover"
                    />
                  )}
                  <div className="p-4">
                    <span className="text-xs uppercase tracking-widest text-white/40">{item.type}</span>
                    <h3 className="mt-1 font-semibold">{item.title}</h3>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
