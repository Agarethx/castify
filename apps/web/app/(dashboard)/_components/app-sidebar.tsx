'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Radio, Film, BarChart2, Settings, LogOut, Video, CalendarDays, Scissors } from 'lucide-react';
import Cookies from 'js-cookie';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import type { UserWithChannel } from '@castify/types';
import { api } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/stream', label: 'Stream', icon: Radio },
  { href: '/content', label: 'Contenido', icon: Film },
  { href: '/epg', label: 'EPG', icon: CalendarDays },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/clips', label: 'Live Clips', icon: Scissors },
  { href: '/castify-video', label: 'Castify Video', icon: Video },
  { href: '/settings', label: 'Configuración', icon: Settings },
] as const;

interface AppSidebarProps {
  user: UserWithChannel;
}

export function AppSidebar({ user }: AppSidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const router   = useRouter();
  const channel  = user.channel;
  const [loggingOut, setLoggingOut] = useState(false);

  // Initialize the API client tenant from the server-provided user data
  // so all client-side API calls have X-Tenant-Slug available immediately
  useEffect(() => {
    if (channel?.slug) {
      api.setTenant(channel.slug);
      Cookies.set('castify_tenant', channel.slug, { expires: 30, sameSite: 'lax', path: '/' });
    }
  }, [channel?.slug]);

  async function handleLogout() {
    setLoggingOut(true);
    await api.auth.logout().catch(() => null);
    router.push('/login');
  }

  return (
    <aside className="w-64 flex flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        {channel?.logoUrl ? (
          <img src={channel.logoUrl} alt={channel.name} className="h-8 w-8 rounded object-contain" />
        ) : (
          <div
            className="h-8 w-8 rounded flex items-center justify-center text-xs font-bold text-background"
            style={{ backgroundColor: channel?.primaryColor ?? '#6366f1' }}
          >
            {(channel?.name ?? 'C')[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{channel?.name ?? 'Castify'}</p>
          <p className="text-xs text-muted-foreground truncate">{channel?.plan ?? ''}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <Separator />
      <div className="px-3 py-3">
        <div className="px-3 py-1 mb-1">
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  );
}
