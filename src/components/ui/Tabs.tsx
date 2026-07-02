import { cn } from '@/lib/utils'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  count?: number
}

export interface TabsProps<T extends string> {
  items: Array<TabItem<T>>
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Underline tabs for switching page sections */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-edge overflow-x-auto', className)}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors',
              active ? 'text-ink border-b-2 border-accent' : 'text-ink-3 hover:text-ink border-b-2 border-transparent',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tnum',
                  active ? 'bg-accent-wash text-accent' : 'bg-sunken text-ink-3',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}

/** Pill segmented control — used for chart time ranges (7d / 30d / 90d / 12m) */
export function Segmented<T extends string>({ options, value, onChange, className, size = 'sm' }: SegmentedProps<T>) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-lg bg-sunken p-0.5', className)} role="group">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md font-medium transition-all duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
              active ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
