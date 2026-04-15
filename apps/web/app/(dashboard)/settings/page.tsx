import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { serverFetch } from '@/lib/api'
import type { UserWithChannel } from '@castify/types'
import { SettingsPage } from './_components/settings-page'

export default async function SettingsRoute(): Promise<React.JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get('castify_access_token')?.value
  const tenantSlug = cookieStore.get('castify_tenant')?.value

  if (!token) redirect('/login')

  let user: UserWithChannel
  try {
    user = await serverFetch<UserWithChannel>('/api/auth/me', token, tenantSlug)
  } catch {
    redirect('/login')
  }

  return <SettingsPage user={user} />
}
