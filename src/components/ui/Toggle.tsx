import * as Switch from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

/** Switch on Radix. With `label` it renders a full labeled row. */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
  const control = (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-accent' : 'bg-hairline',
        !label && className,
      )}
    >
      <Switch.Thumb
        className={cn(
          'block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-soft transition-transform duration-200',
          'data-[state=checked]:translate-x-[18px]',
        )}
      />
    </Switch.Root>
  )

  if (!label) return control

  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-3">{description}</span>}
      </span>
      {control}
    </label>
  )
}
