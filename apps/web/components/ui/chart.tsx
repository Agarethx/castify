'use client'

import * as React from 'react'
import { ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

// ── ChartContainer ────────────────────────────────────────────────────────────

interface ChartContainerProps {
  className?: string
  children: React.ReactElement
  height?: number
}

export function ChartContainer({ className, children, height = 240 }: ChartContainerProps) {
  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

// ── ChartTooltipContent ───────────────────────────────────────────────────────
// Compatible with recharts <Tooltip content={...} /> — receives these props at runtime.

interface TooltipEntry {
  name?: unknown
  value?: unknown
  color?: string
}

interface ChartTooltipContentProps {
  className?: string
  labelFormatter?: (label: string) => string
  valueFormatter?: (value: number, name: string) => string
  // recharts injects these
  payload?: TooltipEntry[]
  label?: unknown
  active?: boolean
}

export function ChartTooltipContent({
  className,
  labelFormatter,
  valueFormatter,
  payload,
  label,
  active,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className={cn('rounded-lg border bg-popover px-3 py-2 text-sm shadow-md', className)}>
      {label != null && (
        <p className="font-medium text-foreground mb-1">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground capitalize">{String(entry.name ?? '')}:</span>
            <span className="font-medium text-foreground">
              {valueFormatter
                ? valueFormatter(entry.value as number, String(entry.name ?? ''))
                : String(entry.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
