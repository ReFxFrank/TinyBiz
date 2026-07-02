// Standalone sparkline for table cells and compact rows: muted 2px line with
// the current (final) point accented, no axes, no chrome.

import { useChartTheme } from './palette'

export interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  /** Accent the final point (default true) */
  accentLast?: boolean
  /** Hex override for the line */
  color?: string
}

export function Sparkline({ data, width = 96, height = 32, accentLast = true, color }: SparklineProps) {
  const theme = useChartTheme()
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((v, i) => [i * step, height - 4 - ((v - min) / span) * (height - 8)] as const)
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = points[points.length - 1]
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={color ?? theme.series[0]}
        strokeOpacity={color ? 1 : 0.55}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {accentLast && <circle cx={lx} cy={ly} r={4} fill={color ?? theme.series[0]} stroke={theme.surface} strokeWidth={2} />}
    </svg>
  )
}
