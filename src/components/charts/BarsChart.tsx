// Column chart on Recharts: thin bars (≤24px), 4px rounded data-end square at
// the baseline, hairline horizontal grid, per-mark hover tooltip, legend for
// 2+ series. Stacked segments are separated by a surface-colored gap stroke.

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltipContent } from './ChartTooltip'
import { ChartLegend } from './ChartCard'
import { seriesColor, useChartTheme } from './palette'

export interface BarSeries {
  key: string
  name: string
  /** Categorical slot index (fixed order) or explicit hex */
  color?: number | string
}

export interface BarsChartProps {
  data: Array<Record<string, string | number | undefined>>
  xKey: string
  series: BarSeries[]
  stacked?: boolean
  height?: number
  valueFormatter?: (v: number) => string
  xTickFormatter?: (v: string | number) => string
  maxTicks?: number
}

export function BarsChart({
  data,
  xKey,
  series,
  stacked,
  height = 240,
  valueFormatter = (v) => v.toLocaleString(),
  xTickFormatter,
  maxTicks = 12,
}: BarsChartProps) {
  const theme = useChartTheme()
  const tickInterval = Math.max(0, Math.ceil(data.length / maxTicks) - 1)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickFormatter={xTickFormatter}
            interval={tickInterval}
            axisLine={{ stroke: theme.axis, strokeWidth: 1 }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            tick={{ fill: theme.muted, fontSize: 11 }}
            tickFormatter={(v: number) => valueFormatter(v)}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(11,11,11,0.04)' }}
            content={(props) => (
              <ChartTooltipContent
                active={props.active}
                label={props.label as string | number}
                payload={props.payload as never}
                theme={theme}
                valueFormatter={valueFormatter}
                labelFormatter={xTickFormatter}
              />
            )}
          />
          {series.map((s, i) => {
            const color = seriesColor(theme, s.color, i)
            const isTop = !stacked || i === series.length - 1
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={color}
                stackId={stacked ? 'stack' : undefined}
                maxBarSize={24}
                radius={isTop ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                stroke={stacked ? theme.surface : undefined}
                strokeWidth={stacked ? 1 : 0}
                isAnimationActive
                animationDuration={500}
              />
            )
          })}
        </BarChart>
      </ResponsiveContainer>
      {series.length >= 2 && (
        <ChartLegend
          items={series.map((s, i) => ({ name: s.name, color: seriesColor(theme, s.color, i), shape: 'rect' as const }))}
        />
      )}
    </div>
  )
}
