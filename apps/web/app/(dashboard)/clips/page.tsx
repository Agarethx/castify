import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { serverFetch } from '@/lib/api'
import type { Content } from '@castify/types'
import { ClipsGallery } from './_components/clips-gallery'

export default async function ClipsPage(): Promise<React.JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get('castify_access_token')?.value
  const tenantSlug = cookieStore.get('castify_tenant')?.value

  if (!token) redirect('/login')

  let contents: Content[] = []
  try {
    contents = await serverFetch<Content[]>('/api/channels/me/content', token, tenantSlug)
  } catch {
    redirect('/login')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Clips</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Extraé momentos virales de tus streams y VODs · Publicá en segundos
          </p>
        </div>
      </div>
      <ClipsGallery contents={contents} />
    </div>
  )
}
