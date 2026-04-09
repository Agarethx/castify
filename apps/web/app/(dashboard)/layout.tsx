import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from '@/lib/api';
import type { UserWithChannel } from '@castify/types';
import { AppSidebar } from './_components/app-sidebar';

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

  const headersList = headers();
  const pathname = headersList.get('x-pathname') ?? '/stream';

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar user={user} currentPath={pathname} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
