import type { ReactNode } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'

/** Mount once in the app shell */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  )
}

export interface TipProps {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
}

/** Wrap any focusable element to give it a themed tooltip */
export function Tip({ content, side = 'top', children }: TipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[60] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-page shadow-lifted animate-fade-in select-none"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
