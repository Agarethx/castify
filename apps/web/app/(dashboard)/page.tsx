import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { serverFetch } from '@/lib/api'
import type { UserWithChannel } from '@castify/types'
import { DashboardHome } from './_components/dashboard-home'

export default async function HomePage(): Promise<React.JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get('castify_access_token')?.value

  if (!token) redirect('/login')

  let user: UserWithChannel
  try {
    user = await serverFetch<UserWithChannel>('/api/auth/me', token)
  } catch {
    redirect('/login')
  }

  const channelName = user.channel?.name ?? 'tu canal'

  return <DashboardHome channelName={channelName} />
}
