import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { serverFetch } from '@/lib/api'
import type { ChannelWithContents, Content } from '@castify/types'
import { Card, CardContent } from '@/components/ui/card'
import { StreamTabs } from './_components/stream-tabs'

const RTMP_HOST = process.env['RTMP_HOST'] ?? 'localhost'

export default async function StreamPage(): Promise<React.JSX.Element> {
  const cookieStore = cookies()
  const token = cookieStore.get('castify_access_token')?.value
  const tenantSlug = cookieStore.get('castify_tenant')?.value

  if (!token) redirect('/login')

  let channel: ChannelWithContents
  try {
    channel = await serverFetch<ChannelWithContents>('/api/channels/me', token, tenantSlug)
  } catch {
    redirect('/login')
  }

  const liveContent: Content | undefined = channel.contents.find((c) => c.type === 'LIVE')
  const vodContents: Content[] = channel.contents.filter(
    (c) => c.type === 'VOD' && c.status === 'PROCESSING' || c.type === 'VOD' && c.status === 'INACTIVE',
  )
  const rtmpUrl = `rtmp://${RTMP_HOST}/live`

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stream</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configurá y gestioná tu transmisión en vivo
        </p>
      </div>

      {liveContent ? (
        <StreamTabs
          content={liveContent}
          rtmpUrl={rtmpUrl}
          vodContents={vodContents}
          plan={channel.plan as 'STARTER' | 'PRO' | 'ENTERPRISE'}
          channelId={channel.id}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No hay un stream LIVE configurado para este canal. Creá un contenido de tipo LIVE desde{' '}
              <a href="/content" className="underline underline-offset-2">Contenido</a>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
