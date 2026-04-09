import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { UserWithChannel } from '@castify/types';

const NAV_ITEMS = [
  { href: '/', label: 'Inicio' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/content', label: 'Contenido' },
  { href: '/settings', label: 'Configuración' },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const cookieStore = cookies();
  const token = cookieStore.get('castify_access_token')?.value;

  if (!token) redirect('/login');

  let user: UserWithChannel;
  try {
    user = await serverFetch<UserWithChannel>('/api/auth/me', token);
  } catch {
    redirect('/login');
  }

  const channel = user.channel;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white/5 border-r border-white/10 flex flex-col">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          {channel?.logoUrl ? (
            <img src={channel.logoUrl} alt={channel.name} className="h-8 w-8 object-contain rounded" />
          ) : (
            <div
              className="h-8 w-8 rounded flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: channel?.primaryColor ?? '#6366f1' }}
            >
              {(channel?.name ?? 'C')[0]?.toUpperCase()}
            </div>
          )}
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate">{channel?.name ?? 'Dashboard'}</p>
            <p className="text-xs text-white/40 truncate">{user.email}</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <form action="/api/auth/logout-action" method="POST">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/5 transition"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
