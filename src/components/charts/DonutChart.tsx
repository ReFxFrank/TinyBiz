// Part-to-whole donut, ≤6 segments (fold the tail into "Other" before passing
// data in, or use foldSlices). Center carries the total; the legend lists every
// segment with its value so color never works alone.

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartTooltipContent } from './ChartTooltip'
import { seriesColor, useChartTheme } from './palette'
import { cn } from '@/lib/utils'

export interface DonutSlice {
  name: string
  value: number
  /** Categorical slot index or hex; defaults to position order */
  color?: number | string
}

export interface DonutChartProps {
  data: DonutSlice[]
  /** Compact formatter for values in legend/tooltip */
  valueFormatter?: (v: number) => string
  /** Label under the center total */
  centerLabel?: string
  size?: number
  className?: string
}

/** Fold everything past the top `keep` slices into a single "Other" slice */
export function foldSlices(data: DonutSlice[], keep = 5): DonutSlice[] {
  if (data.length <= keep + 1) return data
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, keep)
  const rest = sorted.slice(keep).reduce((a, s) => a + s.value, 0)
  return [...head, { name: 'Other', value: rest }]
}

export function DonutChart({ data, valueFormatter = (v) => v.toLocaleString(), centerLabel, size = 200, className }: DonutChartProps) {
  const theme = useChartTheme()
  const total = data.reduce((a, s) => a + s.value, 0)

  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={(props) => (
                <ChartTooltipContent
                  active={props.active}
                  payload={(props.payload as Array<{ name?: string; value?: number }> | undefined)?.map((p, i) => ({
                    name: p.name,
                    value: p.value,
                    color: seriesColor(theme, data.find((d) => d.name === p.name)?.color, data.findIndex((d) => d.name === p.name)),
                  }))}
                  theme={theme}
                  valueFormatter={valueFormatter}
                />
              )}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive
              animationDuration={500}
            >
              {data.map((slice, i) => (
                <Cell key={slice.name} fill={seriesColor(theme, slice.color, i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-ink">{valueFormatter(total)}</span>
          {centerLabel && <span className="mt-0.5 text-[11px] text-ink-3">{centerLabel}</span>}
        </div>
      </div>
      <div className="w-full min-w-0 space-y-2">
        {data.map((slice, i) => (
          <div key={slice.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: seriesColor(theme, slice.color, i) }}
              />
              <span className="truncate">{slice.name}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tnum">
              {valueFormatter(slice.value)}
              <span className="ml-1.5 text-xs font-normal text-ink-3 tnum">
                {total > 0 ? `${Math.round((slice.value / total) * 100)}%` : '0%'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
