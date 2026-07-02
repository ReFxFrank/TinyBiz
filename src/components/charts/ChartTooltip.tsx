// Shared Recharts tooltip content following the dataviz spec: one readout for
// every series at the hovered X; values lead (strong ink), names follow;
// series keyed by a short line of the series color (never a filled box).

import type { ChartTheme } from './palette'

export interface TooltipEntry {
  name?: string | number
  value?: number | string | Array<number | string>
  color?: string
  dataKey?: string | number
}

export interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: TooltipEntry[]
  theme: ChartTheme
  valueFormatter?: (v: number) => string
  labelFormatter?: (label: string | number) => string
}

export function ChartTooltipContent({
  active,
  label,
  payload,
  theme,
  valueFormatter = (v) => v.toLocaleString(),
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl border border-edge bg-raised px-3 py-2.5 shadow-lifted"
      style={{ minWidth: 140 }}
    >
      {label !== undefined && (
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={`${entry.dataKey ?? i}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-xs text-ink-3">
              <span
                aria-hidden
                className="inline-block h-0.5 w-3.5 rounded-full"
                style={{ background: entry.color ?? theme.series[0] }}
              />
              {String(entry.name ?? '')}
            </span>
            <span className="text-[13px] font-semibold text-ink tnum">
              {typeof entry.value === 'number' ? valueFormatter(entry.value) : String(entry.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
