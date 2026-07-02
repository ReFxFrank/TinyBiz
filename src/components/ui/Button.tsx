import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Icon rendered before the label */
  icon?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-[color:var(--accent-fg)] hover:bg-accent-strong shadow-soft hover:shadow-pop active:scale-[0.98]',
  secondary: 'bg-sunken text-ink hover:bg-hairline active:scale-[0.98]',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-critical text-white hover:opacity-90 active:scale-[0.98]',
  outline: 'border border-edge bg-surface text-ink hover:bg-sunken',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 select-none',
        'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required since there is no visible label */
  label: string
  size?: 'sm' | 'md'
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-ink-2 transition-colors duration-150',
        'hover:bg-sunken hover:text-ink disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4' : 'h-9 w-9 [&>svg]:h-[18px] [&>svg]:w-[18px]',
        active && 'bg-accent-wash text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
