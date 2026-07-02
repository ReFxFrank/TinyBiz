import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatProps {
  label: string
  value: ReactNode
  /** Signed percent vs a named period, e.g. { pct: 12.4, vs: 'last month' } */
  delta?: { pct: number; vs: string; /** default true — set false when up is bad (expenses) */ upIsGood?: boolean }
  /** 12-point sparkline series (raw values) */
  trend?: number[]
  icon?: ReactNode
  className?: string
}

/**
 * Stat tile per the dataviz contract: sentence-case label, semibold value in
 * proportional figures, optional signed delta colored by direction × goodness,
 * optional 12-point sparkline (muted, current period accented).
 */
export function Stat({ label, value, delta, trend, icon, className }: StatProps) {
  const up = delta ? delta.pct >= 0 : true
  const good = delta ? (delta.upIsGood ?? true) === up : true
  return (
    <div className={cn('card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-ink-3">{label}</div>
          <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</div>
          {delta && (
            <div className="mt-2 flex items-center gap-1 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-semibold',
                  good ? 'text-[#006300] dark:text-good' : 'text-critical',
                )}
              >
                {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {`${delta.pct >= 0 ? '+' : ''}${delta.pct.toFixed(1)}%`}
              </span>
              <span className="text-ink-3">vs {delta.vs}</span>
            </div>
          )}
        </div>
        {trend && trend.length > 1 ? (
          <MiniSpark data={trend} />
        ) : icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent [&>svg]:h-[18px] [&>svg]:w-[18px]">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Tiny inline sparkline: muted line with the final point accented */
function MiniSpark({ data }: { data: number[] }) {
  const w = 84
  const h = 36
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = w / (data.length - 1)
  const points = data.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 8)] as const)
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = points[points.length - 1]
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--hairline)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  )
}
