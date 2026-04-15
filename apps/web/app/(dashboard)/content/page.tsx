import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { Content } from '@castify/types';
import { ContentManager } from './_components/content-manager';

export default async function ContentPage(): Promise<React.JSX.Element> {
  const cookieStore = cookies();
  const token = cookieStore.get('castify_access_token')?.value;
  const tenantSlug = cookieStore.get('castify_tenant')?.value;

  if (!token) redirect('/login');

  let contents: Content[] = [];
  try {
    contents = await serverFetch<Content[]>('/api/channels/me/content', token, tenantSlug);
  } catch {
    redirect('/login');
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contenido</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Administrá tus videos VOD y streams en vivo
        </p>
      </div>
      <ContentManager initialContents={contents} />
    </div>
  );
}
