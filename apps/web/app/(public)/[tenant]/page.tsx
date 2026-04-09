import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/api';
import type { Channel, Content } from '@castify/types';

interface PageProps {
  params: { tenant: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const channel = await serverFetch<Channel>(`/api/channels/${params.tenant}`);
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
  let channel: Channel;
  let content: Content[];

  try {
    channel = await serverFetch<Channel>(`/api/channels/${params.tenant}`);
    if (!channel.isActive) notFound();
    content = await serverFetch<Content[]>(`/api/channels/${channel.id}/content`);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen" style={{ '--primary': channel.primaryColor } as React.CSSProperties}>
      {/* Header */}
      <header
        className="px-8 py-6 border-b border-white/10 flex items-center gap-4"
        style={{ borderColor: `${channel.primaryColor}30` }}
      >
        {channel.logoUrl && (
          <img
            src={channel.logoUrl}
            alt={channel.name}
            className="h-10 w-auto object-contain"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          <span
            className="text-xs uppercase tracking-widest font-medium"
            style={{ color: channel.primaryColor }}
          >
            {channel.plan}
          </span>
        </div>
      </header>

      {/* Player placeholder */}
      <div className="px-8 pt-8">
        <div
          className="w-full aspect-video rounded-2xl flex items-center justify-center text-white/20 text-sm border"
          style={{ borderColor: `${channel.primaryColor}30`, backgroundColor: `${channel.primaryColor}08` }}
        >
          Player P2P — próximamente
        </div>
      </div>

      {/* Content grid */}
      <section className="px-8 py-10">
        <h2 className="text-xl font-semibold mb-6">Contenido disponible</h2>
        {content.length === 0 ? (
          <p className="text-white/40">No hay contenido publicado aún.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {content.map((item) => (
              <li key={item.id}>
                <a
                  href={`/${params.tenant}/vod/${item.slug}`}
                  className="block rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition group"
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div
                      className="w-full aspect-video"
                      style={{ backgroundColor: `${channel.primaryColor}20` }}
                    />
                  )}
                  <div className="p-4">
                    <span className="text-xs uppercase tracking-widest text-white/40">{item.type}</span>
                    <h3 className="mt-1 font-semibold">{item.title}</h3>
                    {item.duration && (
                      <p className="text-xs text-white/40 mt-1">{Math.floor(item.duration / 60)}m</p>
                    )}
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
