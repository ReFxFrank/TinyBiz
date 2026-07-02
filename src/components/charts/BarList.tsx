// Horizontal bar list (best sellers, category rankings). Nominal categories →
// one hue for every bar (slot 1) per the color rules; the label + value carry
// identity, the bar carries magnitude.

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useChartTheme } from './palette'
import { cn } from '@/lib/utils'

export interface BarListItem {
  label: string
  value: number
  /** Optional leading visual (e.g. <ProductTile size="sm" .../>) */
  icon?: ReactNode
  /** Secondary text under the label */
  sublabel?: string
}

export interface BarListProps {
  items: BarListItem[]
  valueFormatter?: (v: number) => string
  className?: string
  onItemClick?: (item: BarListItem, index: number) => void
}

export function BarList({ items, valueFormatter = (v) => v.toLocaleString(), className, onItemClick }: BarListProps) {
  const theme = useChartTheme()
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, i) => {
        const width = Math.max(2, (item.value / max) * 100)
        const inner = (
          <>
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[13px] font-medium text-ink">{item.label}</span>
                <span className="shrink-0 text-[13px] font-semibold text-ink tnum">{valueFormatter(item.value)}</span>
              </div>
              {item.sublabel && <div className="text-xs text-ink-3">{item.sublabel}</div>}
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sunken">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: theme.series[0] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          </>
        )
        return onItemClick ? (
          <button
            key={item.label}
            onClick={() => onItemClick(item, i)}
            className="flex w-full items-center gap-3 rounded-lg p-1 -m-1 text-left transition-colors hover:bg-sunken/60"
          >
            {inner}
          </button>
        ) : (
          <div key={item.label} className="flex items-center gap-3">
            {inner}
          </div>
        )
      })}
    </div>
  )
}
