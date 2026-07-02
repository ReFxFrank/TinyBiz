import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift for clickable cards */
  interactive?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ interactive, padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'card',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-5',
        padding === 'lg' && 'p-6',
        interactive && 'transition-all duration-200 hover:shadow-lifted hover:-translate-y-0.5 cursor-pointer',
        className,
      )}
      {...rest}
    />
  )
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-aligned actions */
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink leading-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
