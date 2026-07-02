import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Right-hand slide-over for record details — Radix Dialog under the hood */
export function Drawer({ open, onClose, title, subtitle, children, footer, wide }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  'fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-edge bg-raised shadow-lifted',
                  wide ? 'sm:max-w-xl' : 'sm:max-w-md',
                )}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
                  <div className="min-w-0">
                    <Dialog.Title className="truncate text-base font-semibold text-ink">{title}</Dialog.Title>
                    {subtitle && <div className="mt-0.5 text-[13px] text-ink-3">{subtitle}</div>}
                  </div>
                  <Dialog.Close asChild>
                    <IconButton label="Close" size="sm">
                      <X />
                    </IconButton>
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <div className="flex justify-end gap-2 border-t border-edge px-5 py-3.5">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
