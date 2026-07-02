import { cn } from '@/lib/utils'
import { clamp } from '@/lib/utils'

export interface ProgressProps {
  /** 0–100 */
  value: number
  /** Meter severity: accent (default), or status colors as the fill */
  tone?: 'accent' | 'good' | 'warn' | 'critical'
  className?: string
  /** Accessible label */
  label?: string
}

const fillTone = {
  accent: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  critical: 'bg-critical',
}
const trackTone = {
  accent: 'bg-accent-soft',
  good: 'bg-good-wash',
  warn: 'bg-warn-wash',
  critical: 'bg-critical-wash',
}

/** Meter: the unfilled track is a lighter step of the fill's own ramp */
export function Progress({ value, tone = 'accent', className, label }: ProgressProps) {
  const v = clamp(value, 0, 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full', trackTone[tone], className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fillTone[tone])}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}
