import type { ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

export interface MenuProps {
  /** The trigger element (gets Radix trigger behavior via asChild) */
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}

/** Dropdown menu on Radix — keyboard nav, typeahead, and positioning built in */
export function Menu({ trigger, children, align = 'end', className }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 min-w-[190px] rounded-xl border border-edge bg-raised p-1.5 shadow-lifted',
            'animate-slide-up',
            className,
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export interface MenuItemProps {
  icon?: ReactNode
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}

export function MenuItem({ icon, onSelect, danger, disabled, children }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        danger
          ? 'text-critical data-[highlighted]:bg-critical-wash'
          : 'text-ink-2 data-[highlighted]:bg-sunken data-[highlighted]:text-ink',
      )}
    >
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1.5 h-px bg-hairline" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </DropdownMenu.Label>
  )
}
