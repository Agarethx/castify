'use client';

import { useState } from 'react';
import type { Content, ContentStatus } from '@castify/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { StreamStatusBadge } from '@/components/castify/stream-status-badge';
import { VodUploader } from '@/components/castify/vod-uploader';

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ContentManagerProps {
  initialContents: Content[];
}

export function ContentManager({ initialContents }: ContentManagerProps): React.JSX.Element {
  const [contents, setContents] = useState<Content[]>(initialContents);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleUploadComplete(contentId: string, hlsUrl: string) {
    setContents((prev) =>
      prev.map((c) =>
        c.id === contentId
          ? { ...c, status: 'ACTIVE' as ContentStatus, hlsUrl }
          : c,
      ),
    );
    // Add if not already present (race condition guard)
    setContents((prev) => {
      if (prev.some((c) => c.id === contentId)) return prev;
      return [
        { id: contentId, channelId: '', title: 'Video VOD', type: 'VOD', status: 'ACTIVE', streamKey: '', hlsUrl, localPath: null, durationSec: null, createdAt: new Date().toISOString() },
        ...prev,
      ];
    });
    setDialogOpen(false);
  }

  const vodContents   = contents.filter((c) => c.type === 'VOD');
  const liveContents  = contents.filter((c) => c.type === 'LIVE');

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Subir video</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Subir video VOD</DialogTitle>
            </DialogHeader>
            <VodUploader onComplete={handleUploadComplete} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Live streams */}
      {liveContents.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            En vivo
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {liveContents.map((item) => (
              <ContentRow key={item.id} content={item} />
            ))}
          </ul>
        </section>
      )}

      {/* VOD library */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
          Videos
        </h2>
        {vodContents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 flex flex-col items-center gap-3">
            <p className="text-muted-foreground text-sm">No hay videos subidos aún</p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Subir el primer video
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Subir video VOD</DialogTitle>
                </DialogHeader>
                <VodUploader onComplete={handleUploadComplete} />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {vodContents.map((item) => (
              <ContentRow key={item.id} content={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ContentRow({ content }: { content: Content }): React.JSX.Element {
  const isProcessing = content.status === 'PROCESSING';

  return (
    <li className="flex items-center gap-4 px-5 py-4 bg-card hover:bg-accent/20 transition-colors">
      {/* Type badge */}
      <Badge variant={content.type === 'LIVE' ? 'destructive' : 'secondary'} className="shrink-0 text-xs">
        {content.type === 'LIVE' ? 'EN VIVO' : 'VOD'}
      </Badge>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{content.title}</p>
        {content.durationSec && (
          <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(content.durationSec)}</p>
        )}
        {isProcessing && (
          <div className="mt-1.5 h-1.5 w-40 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-full rounded-full bg-yellow-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* Status */}
      <StreamStatusBadge status={content.status} />

      {/* Actions */}
      {content.status === 'ACTIVE' && content.hlsUrl && (
        <a
          href={content.hlsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors shrink-0"
        >
          Ver
        </a>
      )}
    </li>
  );
}
