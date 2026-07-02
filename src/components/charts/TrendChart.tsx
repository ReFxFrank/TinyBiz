// Line/area trend chart on Recharts, styled to the dataviz spec:
// 2px lines, ~10% area wash, hairline horizontal grid, crosshair tooltip
// listing every series, legend whenever there are 2+ series.

import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltipContent } from './ChartTooltip'
import { ChartLegend } from './ChartCard'
import { seriesColor, useChartTheme } from './palette'

export interface TrendSeries {
  /** Key into each data row */
  key: string
  name: string
  /** Categorical slot index (fixed order) or explicit hex */
  color?: number | string
  /** Render the ~10% opacity area wash under the line (default true) */
  area?: boolean
}

export interface TrendChartProps {
  data: Array<Record<string, string | number | Date | undefined>>
  /** Key of the x value in each row */
  xKey: string
  series: TrendSeries[]
  height?: number
  valueFormatter?: (v: number) => string
  xTickFormatter?: (v: string | number) => string
  /** Show at most this many x ticks (default ~6) */
  maxTicks?: number
}

export function TrendChart({
  data,
  xKey,
  series,
  height = 240,
  valueFormatter = (v) => v.toLocaleString(),
  xTickFormatter,
  maxTicks = 6,
}: TrendChartProps) {
  const theme = useChartTheme()
  const gradientId = useId().replace(/:/g, '')
  const tickInterval = Math.max(0, Math.ceil(data.length / maxTicks) - 1)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s, i) => {
              const color = seriesColor(theme, s.color, i)
              return (
                <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              )
            })}
          </defs>
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
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
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
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                fill={s.area === false ? 'transparent' : `url(#${gradientId}-${i})`}
                dot={false}
                activeDot={{ r: 4, fill: color, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive
                animationDuration={500}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
      {series.length >= 2 && (
        <ChartLegend
          items={series.map((s, i) => ({ name: s.name, color: seriesColor(theme, s.color, i), shape: 'line' as const }))}
        />
      )}
    </div>
  )
}
