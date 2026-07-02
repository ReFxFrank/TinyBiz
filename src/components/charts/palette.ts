// Chart color system — mirrors the validated palette in src/index.css.
// Categorical hues are assigned in FIXED slot order, never cycled: a chart's
// series keep their slot even when filtered. Sequential = blue light→dark.

import { useEffect, useState } from 'react'
import { useUI, isDark as themeIsDark } from '@/store/useUI'

/** Categorical slots 1–8 (validated: light on #fcfcfb, dark on #1a1a19) */
export const SERIES_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
export const SERIES_DARK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926']

export interface ChartTheme {
  dark: boolean
  /** Categorical slots, in fixed order */
  series: string[]
  surface: string
  grid: string
  axis: string
  /** Muted tick/label ink */
  muted: string
  text: string
  good: string
  critical: string
}

const LIGHT: ChartTheme = {
  dark: false,
  series: SERIES_LIGHT,
  surface: '#fcfcfb',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  text: '#0b0b0b',
  good: '#006300',
  critical: '#d03b3b',
}

const DARK: ChartTheme = {
  dark: true,
  series: SERIES_DARK,
  surface: '#1a1a19',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  text: '#ffffff',
  good: '#0ca30c',
  critical: '#d03b3b',
}

/** Reactive dark-mode flag (follows the theme setting incl. `system`) */
export function useIsDark(): boolean {
  const theme = useUI((s) => s.theme)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return theme === 'system' ? systemDark : themeIsDark(theme)
}

/** The palette + chrome for the current theme — recharts needs concrete hex */
export function useChartTheme(): ChartTheme {
  return useIsDark() ? DARK : LIGHT
}

/** Resolve a series color: slot index (fixed order) or explicit hex passthrough */
export function seriesColor(theme: ChartTheme, colorOrSlot: number | string | undefined, fallbackSlot: number): string {
  if (typeof colorOrSlot === 'string') return colorOrSlot
  const slot = colorOrSlot ?? fallbackSlot
  return theme.series[slot % theme.series.length]
}
