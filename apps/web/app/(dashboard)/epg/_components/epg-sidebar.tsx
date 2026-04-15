'use client'

import type { EPGEntry } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatus, fmtTime, fmtDuration } from './epg-container'

interface EpgSidebarProps {
  entries: EPGEntry[]
  now: Date
  onSelect: (id: string) => void
}

export function EpgSidebar({ entries, now, onSelect }: EpgSidebarProps) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  return (
    <aside className="hidden xl:flex flex-col w-56 shrink-0 rounded-xl border bg-card sticky top-4">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Próximas 24 horas
        </h3>
      </div>

      <div className="overflow-y-auto max-h-[600px] py-2">
        {sorted.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sin programas en las próximas 24 horas.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {sorted.map((entry) => {
              const status = getStatus(entry, now)
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 hover:bg-muted/30 transition-colors',
                      status === 'on-air' && 'bg-green-500/5 hover:bg-green-500/10',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 pt-0.5">
                        <span
                          className={cn(
                            'text-xs font-mono tabular-nums',
                            status === 'on-air'
                              ? 'text-green-400 font-semibold'
                              : status === 'passed'
                                ? 'text-muted-foreground/50'
                                : 'text-muted-foreground',
                          )}
                        >
                          {fmtTime(entry.startTime)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'text-xs font-medium truncate',
                            status === 'passed' && 'text-muted-foreground line-through',
                          )}
                        >
                          {entry.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmtDuration(entry.duration)}
                        </p>
                      </div>
                      {status === 'on-air' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 text-green-400 border-green-500/40 bg-green-500/10 shrink-0 gap-1"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                          LIVE
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
